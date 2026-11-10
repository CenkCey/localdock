const { isAction, parseParams } = require('./actions');
const { runExclusive } = require('./lock');

function createExecutor({ platform, lock }) {
  return {
    async execute(action, params) {
      if (!isAction(action)) return { ok: false, error: 'UNKNOWN_ACTION' };
      const parsed = parseParams(action, params);
      if (!parsed.ok) return { ok: false, error: 'BAD_PARAMS' };
      return runExclusive(lock, async () => {
        await platform.runAction(action, parsed.steps);
        return { ok: true };
      });
    }
  };
}

module.exports = { createExecutor };
