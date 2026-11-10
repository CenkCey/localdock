const MAX_URL = 500;

function normalizeHttpUrl(ref) {
  if (typeof ref !== 'string' || ref.length < 1 || ref.length > MAX_URL) return null;
  if (/[\s\u0000-\u001f\u007f"<>\\^`|{}]/.test(ref)) return null;
  try {
    const u = new URL(ref);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) return null;
    return u.href;
  } catch (e) {
    return null;
  }
}

module.exports = { normalizeHttpUrl };
