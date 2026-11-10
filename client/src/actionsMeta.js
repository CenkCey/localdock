import {
  Terminal,
  Calculator,
  Activity,
  MonitorUp,
  Lock,
  Volume2,
  Volume1,
  VolumeX,
  Play,
  SkipForward,
  SkipBack,
  Zap,
  Moon
} from 'lucide-react';

export const GROUPS = [
  { id: 'apps', title: 'Apps' },
  { id: 'sound', title: 'Sound' },
  { id: 'media', title: 'Media' },
  { id: 'system', title: 'System' },
  { id: 'other', title: 'Other' }
];

const META = {
  OPEN_CMD: { label: 'Terminal', icon: Terminal, group: 'apps', tone: 'ink' },
  OPEN_CALC: { label: 'Calculator', icon: Calculator, group: 'apps', tone: 'ink' },
  OPEN_TASKMGR: { label: 'Task Manager', icon: Activity, group: 'apps', tone: 'ink' },
  VOLUME_DOWN: { label: 'Volume down', icon: Volume1, group: 'sound', tone: 'cobalt' },
  VOLUME_UP: { label: 'Volume up', icon: Volume2, group: 'sound', tone: 'cobalt' },
  VOLUME_MUTE: { label: 'Mute', icon: VolumeX, group: 'sound', tone: 'cobalt' },
  MEDIA_PREV: { label: 'Previous', icon: SkipBack, group: 'media', tone: 'light' },
  MEDIA_PLAY_PAUSE: { label: 'Play/Pause', icon: Play, group: 'media', tone: 'light' },
  MEDIA_NEXT: { label: 'Next', icon: SkipForward, group: 'media', tone: 'light' },
  SHOW_DESKTOP: { label: 'Desktop', icon: MonitorUp, group: 'system', tone: 'light' },
  LOCK_PC: { label: 'Lock PC', icon: Lock, group: 'system', tone: 'red' },
  SLEEP_PC: { label: 'Sleep PC', icon: Moon, group: 'system', tone: 'red' }
};

const ORDER = Object.keys(META);

function fallbackLabel(id) {
  return id
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function describeAction(id) {
  return META[id] || { label: fallbackLabel(id), icon: Zap, group: 'other', tone: 'light' };
}

export function groupActions(ids) {
  const sorted = [...ids].sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    return (ia === -1 ? ORDER.length : ia) - (ib === -1 ? ORDER.length : ib);
  });
  return GROUPS.map((g) => ({
    ...g,
    items: sorted.filter((id) => describeAction(id).group === g.id)
  })).filter((g) => g.items.length > 0);
}
