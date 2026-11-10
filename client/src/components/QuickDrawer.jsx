import {
  Volume2,
  VolumeX,
  Sun,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  FolderUp,
  PenLine,
  Camera,
  Power,
  ClipboardList
} from 'lucide-react';
import Sheet from './Sheet.jsx';
import Slider from './Slider.jsx';
import { useDockContext } from '../DockContext.js';
import { errorText } from '../protocol.js';
import { tap, tick } from '../haptics.js';

export default function QuickDrawer({ onClose, onOpenPanel }) {
  const dock = useDockContext();
  const { state, live, client } = dock;
  const caps = state.caps || {};
  const data = live.state || {};
  const media = data.media;
  const playing = Boolean(media && media.status === 'playing');
  const hasPower = state.actions.includes('LOCK_PC') || state.actions.includes('SLEEP_PC');

  async function quick(action) {
    tap();
    const result = await client.exec(action);
    if (!result.ok) dock.flash(errorText(result.error), true);
  }

  const tiles = [
    caps.upload && { id: 'files', label: 'Files & Media', icon: FolderUp },
    { id: 'touch', label: 'Touch & sign', icon: PenLine },
    caps.capture && { id: 'capture', label: 'Capture', icon: Camera },
    hasPower && { id: 'power', label: 'Power', icon: Power, tone: 'red' }
  ].filter(Boolean);

  return (
    <Sheet title="Quick controls" side="top" onClose={onClose}>
      {caps.volume && (
        <div className="qrow">
          <button
            className="key mini"
            onClick={() => quick('VOLUME_MUTE')}
            aria-label={data.muted ? 'Unmute' : 'Mute'}
            aria-pressed={Boolean(data.muted)}
          >
            <span className={`cap ${data.muted ? 'tone-red' : 'tone-cobalt'}`}>
              {data.muted ? <VolumeX size={24} strokeWidth={2.25} /> : <Volume2 size={24} strokeWidth={2.25} />}
            </span>
          </button>
          <div className="qslider">
            <span className="qlabel">Volume{data.muted ? ' (muted)' : ''}</span>
            <Slider
              label="Volume"
              value={typeof data.volume === 'number' ? data.volume : 0}
              onSend={(value) => client.request('SET_VOLUME', { value })}
            />
          </div>
        </div>
      )}

      {caps.brightness && typeof data.brightness === 'number' && (
        <div className="qrow">
          <span className="qicon" aria-hidden="true">
            <Sun size={24} strokeWidth={2.25} />
          </span>
          <div className="qslider">
            <span className="qlabel">Brightness</span>
            <Slider
              label="Brightness"
              value={data.brightness}
              onSend={(value) => client.request('SET_BRIGHTNESS', { value })}
            />
          </div>
        </div>
      )}

      {caps.media && (
        <div className="transport">
          <button className="key flat" onClick={() => quick('MEDIA_PREV')} aria-label="Previous track">
            <span className="cap tone-light">
              <SkipBack size={26} strokeWidth={2.25} />
            </span>
          </button>
          <button className="key flat" onClick={() => quick('MEDIA_PLAY_PAUSE')} aria-label={playing ? 'Pause' : 'Play'}>
            <span className="cap tone-cobalt">
              {playing ? <Pause size={28} strokeWidth={2.25} /> : <Play size={28} strokeWidth={2.25} />}
            </span>
          </button>
          <button className="key flat" onClick={() => quick('MEDIA_NEXT')} aria-label="Next track">
            <span className="cap tone-light">
              <SkipForward size={26} strokeWidth={2.25} />
            </span>
          </button>
        </div>
      )}

      <div className="qtiles">
        {tiles.map(({ id, label, icon: Icon, tone }) => (
          <button
            key={id}
            className="key"
            onClick={() => {
              tick();
              onOpenPanel(id);
            }}
            aria-label={label}
          >
            <span className={`cap ${tone ? `tone-${tone}` : 'tone-light'}`}>
              <Icon size={24} strokeWidth={2.25} />
              <span className="cap-label">{label}</span>
            </span>
          </button>
        ))}
      </div>

      {caps.clipboard && (
        <button
          className="qwide"
          onClick={() => {
            tick();
            onOpenPanel('clipboard');
          }}
        >
          <ClipboardList size={22} strokeWidth={2.25} />
          <span>Clipboard</span>
        </button>
      )}
    </Sheet>
  );
}
