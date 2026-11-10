const MAX_ITEMS = 10;
const MAX_TEXT = 5000;

function createClipboard({ platform, hub, caps }) {
  let items = [];
  let counter = 0;

  function add(text) {
    if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_TEXT) return;
    const at = Date.now();
    const existing = items.findIndex((i) => i.text === text);
    if (existing === 0) return;
    let item;
    if (existing > 0) {
      item = { ...items[existing], at };
      items.splice(existing, 1);
    } else {
      counter += 1;
      item = { id: `cb_${counter}`, text, at };
    }
    items = [item, ...items].slice(0, MAX_ITEMS);
    hub.broadcast('CLIPBOARD', { items });
  }

  return {
    start() {
      if (caps.clipboard) platform.watchClipboard(add);
    },
    list: () => items,
    find: (id) => items.find((i) => i.id === id) || null,
    add
  };
}

module.exports = { createClipboard, MAX_TEXT };
