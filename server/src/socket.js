const { ACTION_NAMES } = require('./actions');
const config = require('./config');

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const AUTH_TIMEOUT_MS = Number(process.env.LOCALDOCK_AUTH_TIMEOUT_MS) || 30000;

function isPlain(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function attachSockets(io, ctx, commands) {
  const { auth, hub, state, input, caps } = ctx;

  io.on('connection', (socket) => {
    const ip = socket.handshake.address;
    let authed = false;
    let attempts = 0;

    const timer = setTimeout(() => {
      if (!authed) socket.disconnect(true);
    }, AUTH_TIMEOUT_MS);

    const pinReq = () =>
      socket.emit('PIN_REQ', {
        pinLength: config.PIN_LENGTH,
        attemptsLeft: auth.maxAttempts - attempts,
        name: config.NAME
      });

    function succeed(withToken) {
      authed = true;
      clearTimeout(timer);
      const httpKey = hub.add(socket);
      const result = {
        ok: true,
        name: config.NAME,
        httpKey,
        actions: ACTION_NAMES,
        caps
      };
      if (withToken) result.token = auth.issueToken();
      socket.emit('AUTH_RESULT', result);
      state.sync(hub.size());
      console.log(`[auth] ${ip} connected`);
      state.pushTo(socket).catch(() => {});
    }

    function tooMany() {
      socket.emit('AUTH_RESULT', { ok: false, error: 'TOO_MANY_ATTEMPTS', attemptsLeft: 0 });
      console.warn(`[auth] ${ip} blocked`);
      socket.disconnect(true);
    }

    socket.on('disconnect', () => {
      clearTimeout(timer);
      hub.remove(socket);
      input.forget(socket);
      state.sync(hub.size());
    });

    pinReq();

    socket.on('AUTH', (payload) => {
      if (authed) return;
      if (!isPlain(payload)) {
        socket.emit('AUTH_RESULT', { ok: false, error: 'BAD_PAYLOAD', attemptsLeft: auth.maxAttempts - attempts });
        return;
      }
      if (typeof payload.token === 'string') {
        if (auth.checkToken(payload.token)) {
          succeed(false);
          return;
        }
        socket.emit('AUTH_RESULT', { ok: false, error: 'BAD_TOKEN' });
        pinReq();
        return;
      }
      if (typeof payload.pin !== 'string') {
        socket.emit('AUTH_RESULT', { ok: false, error: 'BAD_PAYLOAD', attemptsLeft: auth.maxAttempts - attempts });
        return;
      }
      if (auth.lockout.blocked(ip)) {
        tooMany();
        return;
      }
      if (auth.checkPin(payload.pin)) {
        auth.lockout.clear(ip);
        succeed(true);
        return;
      }
      attempts += 1;
      const blocked = auth.lockout.fail(ip);
      const attemptsLeft = auth.maxAttempts - attempts;
      if (attemptsLeft <= 0 || blocked) {
        tooMany();
        return;
      }
      socket.emit('AUTH_RESULT', { ok: false, error: 'BAD_PIN', attemptsLeft });
    });

    for (const [event, handler] of Object.entries(commands)) {
      socket.on(event, async (payload) => {
        const id = isPlain(payload) && typeof payload.id === 'string' && ID_RE.test(payload.id) ? payload.id : null;
        if (!authed) {
          if (id) socket.emit('EXEC_RESULT', { id, ok: false, error: 'UNAUTHORIZED' });
          return;
        }
        if (!id) {
          socket.emit('EXEC_RESULT', { id: null, ok: false, error: 'BAD_PARAMS' });
          return;
        }
        let result;
        try {
          result = await handler(socket, payload);
        } catch (e) {
          result = { ok: false, error: 'EXEC_FAILED' };
        }
        console.log(`[cmd] ${event} -> ${result.ok ? 'ok' : result.error}`);
        socket.emit('EXEC_RESULT', { ...result, id });
      });
    }

    socket.on('INPUT', (payload) => {
      if (authed) input.handle(socket, payload);
    });
  });
}

module.exports = { attachSockets };
