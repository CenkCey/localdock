import { useCallback, useEffect, useState } from 'react';
import { loadSettings, saveSettings, sanitizeSettings } from './settings.js';

export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = sanitizeSettings({ ...prev, ...patch });
      saveSettings(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.perf = settings.perf ? 'on' : 'off';
    const color = settings.theme === 'glass' ? '#0b0d14' : '#cdd0c8';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', color);
  }, [settings.theme, settings.perf]);

  return [settings, update];
}
