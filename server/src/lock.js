const PASS_THROUGH = new Set(['TIMEOUT', 'NOT_SUPPORTED', 'NOT_FOUND', 'TOO_LARGE', 'BAD_PARAMS']);

function createLock() {
  let held = false;
  return {
    get held() {
      return held;
    },
    async run(task) {
      if (held) return { busy: true };
      held = true;
      try {
        return { busy: false, value: await task() };
      } finally {
        held = false;
      }
    }
  };
}

async function runExclusive(lock, task) {
  try {
    const outcome = await lock.run(task);
    return outcome.busy ? { ok: false, error: 'BUSY' } : outcome.value;
  } catch (e) {
    return { ok: false, error: e && PASS_THROUGH.has(e.code) ? e.code : 'EXEC_FAILED' };
  }
}

function codedError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

module.exports = { createLock, runExclusive, codedError };
