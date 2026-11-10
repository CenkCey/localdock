export const DEFAULT_PORT = 3000;
export const DEFAULT_PIN_LENGTH = 6;
export const HELLO_TIMEOUT = 2500;

export function parseAddress(input) {
  const raw = String(input || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const match = raw.match(/^([a-zA-Z0-9.-]+)(?::(\d{1,5}))?$/);
  if (!match) return null;
  const port = match[2] ? Number(match[2]) : DEFAULT_PORT;
  if (port < 1 || port > 65535) return null;
  return { host: match[1], port, url: `http://${match[1]}:${port}` };
}

export function normalizeAddress(input) {
  const target = parseAddress(input);
  return target ? `${target.host}:${target.port}` : null;
}

export function isValidPin(pin, length = DEFAULT_PIN_LENGTH) {
  return typeof pin === 'string' && new RegExp(`^\\d{${length}}$`).test(pin);
}

export function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function iconUrl(base, key, appId) {
  return `${base}/icons/${encodeURIComponent(appId)}.png?k=${encodeURIComponent(key)}`;
}

export function uploadUrl(base, key, name) {
  return `${base}/upload?k=${encodeURIComponent(key)}&name=${encodeURIComponent(name)}`;
}

export async function fetchHello(address, timeout = HELLO_TIMEOUT, fetchImpl = globalThis.fetch) {
  const target = parseAddress(address);
  if (!target || !fetchImpl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl(`${target.url}/hello`, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || data.app !== 'localdock') return null;
    return {
      name: String(data.name || ''),
      platform: String(data.platform || ''),
      version: String(data.version || ''),
      pinLength: Number(data.pinLength) || DEFAULT_PIN_LENGTH
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const ERROR_TEXT = {
  INVALID_ADDRESS: 'Enter the PC address, for example 192.168.1.20',
  UNREACHABLE: 'Could not reach the PC. Check the address and that both devices are on the same Wi-Fi.',
  DISCONNECTED: 'Connection to the PC was lost. Tap the PC to reconnect.',
  TOO_MANY_ATTEMPTS: 'Too many wrong PINs. Wait a minute, then try again.',
  BAD_PIN: 'Wrong PIN',
  BAD_TOKEN: 'This phone is no longer paired. Enter the PIN again.',
  BAD_PAYLOAD: 'Invalid request',
  UNAUTHORIZED: 'Not authorized. Reconnect to the PC.',
  UNKNOWN_ACTION: 'The PC does not know this action',
  BAD_PARAMS: 'The PC rejected this request. Check the value and try again.',
  BUSY: 'The PC is busy, try again',
  TIMEOUT: 'The PC did not answer in time. Try again.',
  EXEC_FAILED: 'The command failed on the PC',
  NOT_SUPPORTED: 'This PC does not support that',
  NOT_FOUND: 'The PC could not find it. It may have been moved or removed.',
  TOO_LARGE: 'That is too large for the PC to accept',
  NOT_CONNECTED: 'Not connected to the PC'
};

export function errorText(code) {
  return ERROR_TEXT[code] || 'Something went wrong. Try again.';
}

export function uploadErrorText(status) {
  if (status === 413) return 'That file is larger than 2 GB, which the PC will not accept.';
  if (status === 401) return 'The PC no longer trusts this connection. Reconnect and try again.';
  if (status === 0) return 'The upload was interrupted. Check the Wi-Fi connection and try again.';
  return 'The PC could not save the file. Try again.';
}
