function createStderrLog(prefix, maxLines, write) {
  const lines = [];
  let flushed = false;
  let pending = '';

  function push(line) {
    const text = line.replace(/\r/g, '').trim();
    if (text && lines.length < maxLines) lines.push(text);
  }

  return {
    add(chunk) {
      if (flushed) return;
      pending += String(chunk);
      const parts = pending.split('\n');
      pending = parts.pop();
      parts.forEach(push);
    },
    flush() {
      if (flushed) return false;
      flushed = true;
      push(pending);
      pending = '';
      lines.forEach((line) => write(`${prefix} ${line}`));
      return lines.length > 0;
    },
    discard() {
      flushed = true;
      lines.length = 0;
      pending = '';
    }
  };
}

module.exports = { createStderrLog };
