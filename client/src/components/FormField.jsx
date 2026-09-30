export function FormField({ label, hint, error, ...props }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className={`input ${error ? 'input-error' : ''}`} {...props} />
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function TextareaField({ label, hint, error, ...props }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <textarea className={`input textarea ${error ? 'input-error' : ''}`} {...props} />
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
