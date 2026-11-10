import { useState } from 'react';
import { Check } from 'lucide-react';
import Sheet from './Sheet.jsx';
import { SCENES } from '../scenes.js';
import { DENSITIES, GLASS_STYLES } from '../settings.js';
import { tick, tap } from '../haptics.js';

export default function AppearanceSheet({ settings, onChange, onClose }) {
  const [preview, setPreview] = useState(settings.scene);
  const dirty = preview !== settings.scene;

  return (
    <Sheet title="Appearance" onClose={onClose} tall cols>
      <section className="field-group">
        <h3 className="field-title">Background</h3>
        <p className="field-note">
          Pick a scene to preview it, then apply.
        </p>
        <div className="scene-preview" aria-hidden="true">
          <div key={preview} className={`scene scene-${preview} scene-in`} />
          <div className="mini-tiles">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="scene-grid" role="radiogroup" aria-label="Background scene">
          {SCENES.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={preview === s.id}
              className={preview === s.id ? 'scene-chip on' : 'scene-chip'}
              onClick={() => {
                tick();
                setPreview(s.id);
              }}
            >
              <span className={`scene scene-${s.id}`} />
              <span className="scene-name">{s.name}</span>
              {settings.scene === s.id && (
                <span className="scene-check">
                  <Check size={14} strokeWidth={3.5} />
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          className="primary-btn"
          disabled={!dirty}
          onClick={() => {
            tap();
            onChange({ scene: preview });
          }}
        >
          {dirty ? 'Apply background' : 'Background applied'}
        </button>
      </section>

      <section className="field-group">
        <h3 className="field-title">Icons per page</h3>
        <div className="segment" role="radiogroup" aria-label="Icons per page">
          {DENSITIES.map((d) => (
            <button
              key={d}
              role="radio"
              aria-checked={settings.density === d}
              className={settings.density === d ? 'seg on' : 'seg'}
              onClick={() => {
                tick();
                onChange({ density: d });
              }}
            >
              {d}
            </button>
          ))}
        </div>
        <p className="field-note">Applies to this phone only.</p>
      </section>

      <section className="field-group">
        <h3 className="field-title">Glass style</h3>
        <div className="segment" role="radiogroup" aria-label="Glass style">
          {GLASS_STYLES.map((g) => (
            <button
              key={g}
              role="radio"
              aria-checked={settings.glass === g}
              className={settings.glass === g ? 'seg on' : 'seg'}
              onClick={() => {
                tick();
                onChange({ glass: g });
              }}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="field-group">
        <div className="switch-row">
          <div>
            <h3 className="field-title">App names</h3>
            <p className="field-note">Show a label under every icon.</p>
          </div>
          <button
            role="switch"
            aria-checked={settings.labels}
            aria-label="App names"
            className={settings.labels ? 'switch on' : 'switch'}
            onClick={() => {
              tick();
              onChange({ labels: !settings.labels });
            }}
          >
            <span />
          </button>
        </div>
      </section>

      <section className="field-group">
        <div className="switch-row">
          <div>
            <h3 className="field-title">Immersive mode</h3>
            <p className="field-note">Hide the top pill until you pull down.</p>
          </div>
          <button
            role="switch"
            aria-checked={settings.immersive}
            aria-label="Immersive mode"
            className={settings.immersive ? 'switch on' : 'switch'}
            onClick={() => {
              tick();
              onChange({ immersive: !settings.immersive });
            }}
          >
            <span />
          </button>
        </div>
      </section>

      <section className="field-group">
        <div className="switch-row">
          <div>
            <h3 className="field-title">Performance mode</h3>
            <p className="field-note">Turns off blur, shadows and animations for older phones.</p>
          </div>
          <button
            role="switch"
            aria-checked={settings.perf}
            aria-label="Performance mode"
            className={settings.perf ? 'switch on' : 'switch'}
            onClick={() => {
              tick();
              onChange({ perf: !settings.perf });
            }}
          >
            <span />
          </button>
        </div>
      </section>
    </Sheet>
  );
}
