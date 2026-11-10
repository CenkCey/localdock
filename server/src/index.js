const http = require('http');
const { spawn } = require('child_process');
const config = require('./config');

if (process.platform !== 'win32' && !config.DEV) {
  console.error('LocalDock server only runs on Windows.');
  process.exit(1);
}

const { Server } = require('socket.io');
const { getLocalIPv4 } = require('./network');
const { generatePin, createAuth } = require('./auth');
const { createStore } = require('./store');
const { createLock } = require('./lock');
const { createExecutor } = require('./executor');
const { createPlatform } = require('./platform');
const { createHub } = require('./hub');
const { createState } = require('./state');
const { createApps } = require('./apps');
const { createLayout } = require('./layout');
const { createClipboard } = require('./clipboard');
const { createInput } = require('./input');
const { createCapture } = require('./capture');
const { createCommands } = require('./commands');
const { createPanel } = require('./panel');
const { createHttp } = require('./http');
const { attachSockets } = require('./socket');

const MAX_BUFFER = 3 * 1024 * 1024;

function pickPin() {
  const given = process.env.LOCALDOCK_PIN;
  if (given && /^\d{6}$/.test(given)) return given;
  if (given) console.warn('LOCALDOCK_PIN ignored: must be 6 digits');
  return generatePin();
}

async function main() {
  const pin = pickPin();
  const store = createStore(config.DATA_DIR);
  const platform = createPlatform();
  const caps = await platform.init();
  const lock = createLock();
  const hub = createHub();
  const auth = createAuth({ store, pin });
  const apps = createApps({ platform, store });
  const layout = createLayout({ store, apps });
  const state = createState({ platform, hub, caps });
  const clipboard = createClipboard({ platform, hub, caps });
  const input = createInput({ platform, caps });
  const capture = createCapture({ platform });
  const executor = createExecutor({ platform, lock });
  const panel = createPanel({ hub, auth, pin, caps });
  const ctx = { platform, caps, lock, hub, auth, apps, layout, state, clipboard, input, capture, executor, panel };

  const server = http.createServer(createHttp(ctx));
  server.requestTimeout = 0;
  server.timeout = 0;
  const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: MAX_BUFFER });
  attachSockets(io, ctx, createCommands(ctx));
  clipboard.start();

  const shutdown = () => {
    state.stop();
    platform.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(config.PORT, config.HOST, () => {
    const ip = getLocalIPv4();
    console.log('');
    console.log('================ LocalDock ================');
    console.log(` Address : ${ip ? `${ip}:${config.PORT}` : `no LAN IPv4 found (port ${config.PORT})`}`);
    console.log(` PIN     : ${pin}`);
    console.log('===========================================');
    console.log(` Panel   : http://localhost:${config.PORT}/panel`);
    console.log('');
    if (config.IS_WINDOWS && !config.DEV && process.env.LOCALDOCK_NOPANEL !== '1') {
      spawn('cmd', ['/c', 'start', '', `http://localhost:${config.PORT}/panel`], { detached: true, stdio: 'ignore' }).unref();
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
