const { spawn } = require('child_process');
const readline = require('readline');
const { codedError } = require('../lock');
const { createStderrLog } = require('./stderrlog');

function powershellSpec(script) {
  return {
    command: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script]
  };
}

function createWorker({ script, command, args = [], captureStderr = false, startTimeoutMs = 45000 }) {
  const spec = command ? { command, args } : powershellSpec(script);
  let proc = null;
  let ready = null;
  let current = null;
  let blockedUntil = 0;
  const queue = [];
  let nextRid = 1;

  function dispose(p, error, startup) {
    if (proc === p) {
      proc = null;
      ready = null;
    }
    if (startup) blockedUntil = Date.now() + 3000;
    try {
      p.kill();
    } catch (e) {}
    if (current && current.proc === p) {
      const item = current;
      current = null;
      clearTimeout(item.timer);
      item.reject(error);
    }
    pump();
  }

  function start() {
    if (proc) return ready;
    if (Date.now() < blockedUntil) return Promise.reject(codedError('EXEC_FAILED', 'worker unavailable'));
    const p = spawn(spec.command, spec.args, {
      stdio: ['pipe', 'pipe', captureStderr ? 'pipe' : 'ignore'],
      windowsHide: true
    });
    proc = p;
    const errLog = captureStderr ? createStderrLog('[helper]', 20, (line) => console.error(line)) : null;
    if (errLog && p.stderr) {
      p.stderr.setEncoding('utf8');
      p.stderr.on('data', (chunk) => errLog.add(chunk));
      p.stderr.on('error', () => {});
    }
    let isReady = false;
    let markReady;
    ready = new Promise((resolve, reject) => {
      markReady = () => {
        isReady = true;
        if (errLog) errLog.discard();
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        if (errLog) errLog.flush();
        reject(codedError('TIMEOUT', 'worker start timeout'));
        dispose(p, codedError('TIMEOUT'), true);
      }, startTimeoutMs);
      p.once('error', () => {
        clearTimeout(timer);
        if (errLog) errLog.flush();
        reject(codedError('EXEC_FAILED', 'worker spawn failed'));
        dispose(p, codedError('EXEC_FAILED'), true);
      });
      p.once('exit', () => {
        clearTimeout(timer);
        if (errLog && !isReady) setTimeout(() => errLog.flush(), 50);
        reject(codedError('EXEC_FAILED', 'worker exited'));
        dispose(p, codedError('EXEC_FAILED'), !isReady);
      });
    });
    ready.catch(() => {});
    p.stdin.on('error', () => {});
    readline.createInterface({ input: p.stdout }).on('line', (line) => {
      if (line === '@@READY') {
        markReady();
        return;
      }
      if (!line.startsWith('@@')) return;
      let msg;
      try {
        msg = JSON.parse(Buffer.from(line.slice(2), 'base64').toString('utf8'));
      } catch (e) {
        return;
      }
      if (!current || current.proc !== p || msg.rid !== current.rid) return;
      const item = current;
      current = null;
      clearTimeout(item.timer);
      if (msg.ok) item.resolve(msg.data === undefined ? null : msg.data);
      else item.reject(codedError('EXEC_FAILED', String(msg.error || 'failed')));
      pump();
    });
    return ready;
  }

  function pump() {
    if (current || queue.length === 0) return;
    const item = queue.shift();
    current = item;
    let waitFor;
    try {
      waitFor = start();
    } catch (e) {
      waitFor = Promise.reject(e);
    }
    const p = proc;
    item.proc = p;
    waitFor.then(
      () => {
        if (current !== item || proc !== p) return;
        item.rid = nextRid;
        nextRid += 1;
        item.timer = setTimeout(() => dispose(p, codedError('TIMEOUT')), item.timeoutMs);
        const body = JSON.stringify({ ...item.payload, rid: item.rid });
        p.stdin.write(`${Buffer.from(body, 'utf8').toString('base64')}\n`);
      },
      (error) => {
        if (current !== item) return;
        current = null;
        item.reject(error);
        pump();
      }
    );
  }

  return {
    ensure: () => start(),
    request(payload, timeoutMs = 15000) {
      return new Promise((resolve, reject) => {
        queue.push({ payload, timeoutMs, resolve, reject, proc: null, rid: 0, timer: null });
        pump();
      });
    },
    send(line) {
      let waitFor;
      try {
        waitFor = start();
      } catch (e) {
        return;
      }
      const p = proc;
      waitFor.then(
        () => {
          if (proc === p) p.stdin.write(`${line}\n`);
        },
        () => {}
      );
    },
    close() {
      if (proc) {
        try {
          proc.kill();
        } catch (e) {}
      }
      proc = null;
      ready = null;
    }
  };
}

module.exports = { createWorker };
