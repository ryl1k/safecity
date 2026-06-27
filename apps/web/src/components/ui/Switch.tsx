import type { CSSProperties } from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  label: string;
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  const track: CSSProperties = {
    position: 'relative',
    width: '2.6em',
    height: '1.5em',
    borderRadius: '1em',
    transition: 'background .15s',
    background: checked ? 'var(--sc-primary)' : 'var(--sc-border-strong)',
    display: 'inline-block',
    flexShrink: 0,
  };
  const thumb: CSSProperties = {
    position: 'absolute',
    top: '0.15em',
    left: checked ? '1.25em' : '0.15em',
    width: '1.2em',
    height: '1.2em',
    borderRadius: '50%',
    background: '#fff',
    transition: 'left .15s',
    boxShadow: '0 1px 2px rgba(0,0,0,.3)',
  };
  return (
    <button
      type="button"
      className="sc-foc"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.7em',
        width: '100%',
        minHeight: '2.9em',
        padding: '0 1em',
        border: 'var(--sc-bw) solid var(--sc-border-strong)',
        borderRadius: '0.8em',
        background: 'var(--sc-surface)',
        color: 'var(--sc-text)',
        fontFamily: 'inherit',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      <span aria-hidden style={track}>
        <span style={thumb} />
      </span>
      <span style={{ fontSize: '0.95em' }}>{label}</span>
      <span
        aria-hidden
        style={{
          marginLeft: 'auto',
          fontWeight: 700,
          color: checked ? 'var(--sc-ok)' : 'var(--sc-muted)',
        }}
      >
        {checked ? 'Увімк.' : 'Вимк.'}
      </span>
    </button>
  );
}
