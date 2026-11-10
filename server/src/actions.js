const ACTION_NAMES = [
  'OPEN_CMD',
  'OPEN_CALC',
  'OPEN_TASKMGR',
  'SHOW_DESKTOP',
  'LOCK_PC',
  'SLEEP_PC',
  'VOLUME_UP',
  'VOLUME_DOWN',
  'VOLUME_MUTE',
  'MEDIA_PLAY_PAUSE',
  'MEDIA_NEXT',
  'MEDIA_PREV'
];

const STEP_ACTIONS = new Set(['VOLUME_UP', 'VOLUME_DOWN']);

function isAction(name) {
  return typeof name === 'string' && ACTION_NAMES.includes(name);
}

function parseParams(name, params) {
  if (params !== undefined && (params === null || typeof params !== 'object' || Array.isArray(params))) {
    return { ok: false };
  }
  if (!STEP_ACTIONS.has(name)) return { ok: true, steps: 1 };
  if (params === undefined || params.steps === undefined) return { ok: true, steps: 5 };
  const n = params.steps;
  return Number.isInteger(n) && n >= 1 && n <= 25 ? { ok: true, steps: n } : { ok: false };
}

module.exports = { ACTION_NAMES, isAction, parseParams };
