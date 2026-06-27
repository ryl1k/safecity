import type { CSSProperties } from 'react';

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  onVoice?: () => void;
}

const wrap: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6em',
  background: 'var(--sc-surface-2)',
  border: 'var(--sc-bw) solid var(--sc-border-strong)',
  borderRadius: '0.85em',
  padding: '0.1em 0.9em',
  minHeight: '2.9em',
};

export function SearchBar({ value, onChange, placeholder, ariaLabel, onVoice }: SearchBarProps) {
  return (
    <div style={wrap}>
      <span aria-hidden style={{ fontSize: '1.1em', color: 'var(--sc-muted)' }}>
        ⌕
      </span>
      <input
        className="sc-foc"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          background: 'transparent',
          fontFamily: 'inherit',
          fontSize: '1em',
          color: 'var(--sc-text)',
          outline: 'none',
          minHeight: '2.6em',
        }}
      />
      {onVoice ? (
        <button
          className="sc-foc"
          onClick={onVoice}
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--sc-primary)',
            fontWeight: 700,
            fontFamily: 'inherit',
            fontSize: '0.85em',
            cursor: 'pointer',
          }}
        >
          Голос
        </button>
      ) : null}
    </div>
  );
}
