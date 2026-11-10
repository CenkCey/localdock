const POLL_MS = 2000;

function createState({ platform, hub, caps }) {
  let current = null;
  let timer = null;
  let chain = Promise.resolve();

  async function read() {
    const [volume, brightness, media] = await Promise.all([
      caps.volume ? platform.getVolume().catch(() => null) : null,
      caps.brightness ? platform.getBrightness().catch(() => null) : null,
      caps.media ? platform.getMedia().catch(() => null) : null
    ]);
    return {
      volume: volume ? volume.volume : null,
      muted: volume ? Boolean(volume.muted) : false,
      brightness: typeof brightness === 'number' ? brightness : null,
      media: media || null
    };
  }

  function refresh(exceptId) {
    const job = chain.then(async () => {
      const next = await read();
      const changed = JSON.stringify(next) !== JSON.stringify(current);
      current = next;
      if (changed) hub.broadcast('STATE', next, exceptId);
      return next;
    });
    chain = job.catch(() => {});
    return job;
  }

  return {
    refresh,
    async pushTo(socket) {
      const next = await refresh(socket.id);
      socket.emit('STATE', next);
    },
    sync(clients) {
      if (clients > 0 && !timer) {
        timer = setInterval(() => refresh().catch(() => {}), POLL_MS);
      } else if (clients === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}

module.exports = { createState };
