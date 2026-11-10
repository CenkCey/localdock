import { useEffect, useState } from 'react';
import { X, Delete } from 'lucide-react';
import { errorText } from '../protocol.js';
import { tick, reject } from '../haptics.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

export default function PinModal({ address, name, pinLength, error, errorAt, attemptsLeft, notice, onSubmit, onCancel }) {
  const [digits, setDigits] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setDigits('');
    setSending(false);
    if (errorAt) reject();
  }, [errorAt]);

  function press(key) {
    if (sending) return;
    tick();
    if (key === 'back') {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (digits.length >= pinLength) return;
    const next = digits + key;
    setDigits(next);
    if (next.length === pinLength) {
      setSending(true);
      onSubmit(next);
    }
  }

  const message = error
    ? `${errorText(error)}. ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`
    : sending
      ? 'Checking'
      : 'PIN';

  return (
    <div className="overlay overlay-bottom pin-overlay" role="dialog" aria-modal="true" aria-label="Enter the PIN">
      <div className="sheet sheet-from-bottom">
        <div className="sheet-top">
          <h2 className="sheet-title">Enter the PIN</h2>
          <button className="close" onClick={onCancel} aria-label="Cancel">
            <X size={22} strokeWidth={2.25} />
          </button>
        </div>
        <p className="sheet-sub">{notice || `It is printed in the terminal of ${name || address || 'your PC'}.`}</p>

        <div key={errorAt} className={error ? 'lcd pins shake' : 'lcd pins'}>
          <div className="cells">
            {Array.from({ length: pinLength }, (_, i) => (
              <span key={i} className="cell">
                {i < digits.length ? '•' : ''}
              </span>
            ))}
          </div>
          <p className={error ? 'lcd-line bad' : 'lcd-line'} aria-live="polite">
            {message}
          </p>
        </div>

        <div className="keypad">
          {KEYS.map((key, i) =>
            key === '' ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                className="key"
                onClick={() => press(key)}
                aria-label={key === 'back' ? 'Delete' : key}
                disabled={sending}
              >
                <span className={key === 'back' ? 'cap tone-ink' : 'cap tone-light'}>
                  {key === 'back' ? <Delete size={26} strokeWidth={2.25} /> : <span className="digit">{key}</span>}
                </span>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
