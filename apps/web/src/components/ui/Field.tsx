import type { InputHTMLAttributes, CSSProperties } from 'react';
import { useId } from 'react';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  help?: string;
  error?: string;
}

const inputBase: CSSProperties = {
  width: '100%',
  minHeight: '2.75em',
  padding: '0 0.9em',
  borderRadius: '0.7em',
  background: 'var(--sc-surface)',
  color: 'var(--sc-text)',
  fontFamily: 'inherit',
  fontSize: '1em',
  border: 'var(--sc-bw) solid var(--sc-border-strong)',
};

export function Field({ label, help, error, id, style, ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helpId = `${inputId}-help`;
  const errId = `${inputId}-err`;
  const describedBy = error ? errId : help ? helpId : undefined;

  return (
    <div>
      <label
        htmlFor={inputId}
        style={{ display: 'block', fontWeight: 600, fontSize: '0.9em', marginBottom: '0.4em' }}
      >
        {label}
      </label>
      <input
        id={inputId}
        className="sc-foc"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        style={{
          ...inputBase,
          ...(error
            ? { border: '2px solid var(--sc-bad)', background: 'var(--sc-bad-bg)' }
            : {}),
          ...style,
        }}
        {...rest}
      />
      {error ? (
        <div
          id={errId}
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35em',
            fontSize: '0.8em',
            color: 'var(--sc-bad)',
            fontWeight: 700,
            marginTop: '0.35em',
          }}
        >
          <span aria-hidden>✕</span> {error}
        </div>
      ) : help ? (
        <div id={helpId} style={{ fontSize: '0.78em', color: 'var(--sc-muted)', marginTop: '0.35em' }}>
          {help}
        </div>
      ) : null}
    </div>
  );
}
