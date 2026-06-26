import type { CSSProperties, ReactNode } from 'react';

export interface ChipProps {
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function Chip({ pressed, onToggle, children }: ChipProps) {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4em',
    minHeight: '2.6em',
    padding: '0 1em',
    borderRadius: '2em',
    fontFamily: 'inherit',
    fontSize: '0.9em',
    cursor: 'pointer',
    border: pressed
      ? 'var(--sc-bw) solid var(--sc-primary)'
      : 'var(--sc-bw) solid var(--sc-border-strong)',
    background: pressed ? 'var(--sc-primary)' : 'var(--sc-surface)',
    color: pressed ? 'var(--sc-on-primary)' : 'var(--sc-text)',
    fontWeight: pressed ? 700 : 600,
  };
  return (
    <button className="sc-foc" aria-pressed={pressed} onClick={onToggle} style={style}>
      {children}
    </button>
  );
}
