const KEYS = {
  VOLUME_MUTE: 173,
  VOLUME_DOWN: 174,
  VOLUME_UP: 175,
  MEDIA_NEXT: 176,
  MEDIA_PREV: 177,
  MEDIA_PLAY_PAUSE: 179
};

function sendKey(code, times) {
  const script = `$w=New-Object -ComObject WScript.Shell; 1..${times} | ForEach-Object { $w.SendKeys([char]${code}) }`;
  return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${script}"`;
}

const FIXED = {
  OPEN_CMD: 'start "" cmd.exe',
  OPEN_CALC: 'start "" calc.exe',
  OPEN_TASKMGR: 'start "" taskmgr.exe',
  SHOW_DESKTOP:
    'powershell -NoProfile -NonInteractive -Command "(New-Object -ComObject Shell.Application).ToggleDesktop()"',
  LOCK_PC: 'rundll32.exe user32.dll,LockWorkStation',
  SLEEP_PC: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0'
};

function windowsCommand(name, steps) {
  if (Object.prototype.hasOwnProperty.call(FIXED, name)) return FIXED[name];
  if (Object.prototype.hasOwnProperty.call(KEYS, name)) {
    const n = name === 'VOLUME_UP' || name === 'VOLUME_DOWN' ? steps : 1;
    if (!Number.isInteger(n) || n < 1 || n > 25) return null;
    return sendKey(KEYS[name], n);
  }
  return null;
}

module.exports = { windowsCommand };
