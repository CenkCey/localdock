import { AppWindow, Folder, Link2 } from 'lucide-react';
import { describeAction } from './actionsMeta.js';
import { basename, hostOf } from './layout.js';

export function tileLabel(tile) {
  if (tile.label) return tile.label;
  if (tile.kind === 'action') return describeAction(tile.ref).label;
  if (tile.kind === 'folder') return basename(tile.ref);
  if (tile.kind === 'url') return hostOf(tile.ref);
  return 'App';
}

export function tileIcon(tile) {
  if (tile.kind === 'action') return describeAction(tile.ref).icon;
  if (tile.kind === 'folder') return Folder;
  if (tile.kind === 'url') return Link2;
  return AppWindow;
}

export function tileTone(tile) {
  if (tile.kind === 'action') return describeAction(tile.ref).tone;
  if (tile.kind === 'folder') return 'light';
  if (tile.kind === 'url') return 'cobalt';
  return 'light';
}
