import { Volume2, VolumeX, Sun, SkipBack, SkipForward, Play, Pause, FolderUp, MousePointer2, Camera, Power } from 'lucide-react';
import Sheet from './Sheet.jsx';
import MediaCover from './MediaCover.jsx';
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
  const hasMedia = Boolean(media && media.title && media.status !== 'stopped');
  const playing = Boolean(media && media.status === 'playing');
  const hasPower = state.actions.includes('LOCK_PC') || state.actions.includes('SLEEP_PC');
  const showBrightness = caps.brightness && typeof data.brightness === 'number';

  async function quick(action) {
    tap();
    const result = await client.exec(action);
    if (!result.ok) dock.flash(errorText(result.error), true);
  }

  const pills = [
    caps.upload && { id: 'files', label: 'Files & Media', icon: FolderUp },
    { id: 'touch', label: 'Touchpad & sign', icon: MousePointer2 },
    caps.capture && { id: 'capture', label: 'Capture', icon: Camera },
    hasPower && { id: 'power', label: 'Power', icon: Power, red: true }
  ].filter(Boolean);

  return (
    <Sheet title="Quick controls" side="top" bare onClose={onClose}>
      <div className="qc">
        <div className="qleft">
          <div className="qpills">
            {pills.map(({ id, label, icon: Icon, red }) => (
              <button
                key={id}
                className={red ? 'qpill red' : 'qpill'}
                onClick={() => {
                  tick();
                  onOpenPanel(id);
                }}
              >
                <span className="qpill-ic">
                  <Icon size={21} strokeWidth={2.25} />
                </span>
                {label}
              </button>
            ))}
          </div>

          {showBrightness && (
            <Slider
              label="Brightness"
              icon={<Sun size={22} strokeWidth={2.25} />}
              value={data.brightness}
              onSend={(value) => client.request('SET_BRIGHTNESS', { value })}
            />
          )}

          {caps.volume && (
            <div className="qvol">
              <Slider
                label="Volume"
                icon={<Volume2 size={22} strokeWidth={2.25} />}
                value={typeof data.volume === 'number' ? data.volume : 0}
                onSend={(value) => client.request('SET_VOLUME', { value })}
              />
              <button
                className={data.muted ? 'qmute on' : 'qmute'}
                onClick={() => quick('VOLUME_MUTE')}
                aria-label={data.muted ? 'Unmute' : 'Mute'}
                aria-pressed={Boolean(data.muted)}
              >
                {data.muted ? <VolumeX size={24} strokeWidth={2.25} /> : <Volume2 size={24} strokeWidth={2.25} />}
              </button>
            </div>
          )}
        </div>

        {caps.media && (
          <div className="qmedia">
            <div className="qmedia-top">
              <span className="qcover">
                <MediaCover src={hasMedia ? media.thumb : null} size={30} />
              </span>
              <span className="qtext">
                <span className="qtitle">{hasMedia ? media.title : 'Nothing playing'}</span>
                <span className="qartist">{hasMedia ? media.artist || (playing ? 'Playing' : 'Paused') : 'Media on the PC'}</span>
              </span>
            </div>
            <div className="qtransport">
              <button onClick={() => quick('MEDIA_PREV')} aria-label="Previous track">
                <SkipBack size={22} strokeWidth={2.25} />
              </button>
              <button className="main" onClick={() => quick('MEDIA_PLAY_PAUSE')} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause size={24} strokeWidth={2.25} /> : <Play size={24} strokeWidth={2.25} />}
              </button>
              <button onClick={() => quick('MEDIA_NEXT')} aria-label="Next track">
                <SkipForward size={22} strokeWidth={2.25} />
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
