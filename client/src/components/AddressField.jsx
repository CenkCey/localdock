export default function AddressField({ value, onChange, status, bad, id }) {
  return (
    <label className="lcd" htmlFor={id}>
      <span className={bad ? 'lcd-line bad' : 'lcd-line'} role={bad ? 'alert' : undefined}>
        {status}
      </span>
      <input
        id={id}
        className="lcd-input"
        type="text"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck="false"
        placeholder="192.168.1.20"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="PC address"
      />
    </label>
  );
}
