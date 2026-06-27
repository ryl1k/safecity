import type { CSSProperties } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  const wrap: CSSProperties = {
    display: 'inline-flex',
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    background: 'var(--sc-surface-2)',
    border: 'var(--sc-bw) solid var(--sc-border)',
    borderRadius: '0.8em',
    padding: '0.25em',
  };
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={wrap}>
      {options.map((o) => {
        const active = o.value === value;
        const style: CSSProperties = {
          flex: 1,
          minWidth: 0,
          minHeight: '2.5em',
          padding: '0.3em 0.5em',
          border: 'none',
          borderRadius: '0.6em',
          fontFamily: 'inherit',
          fontSize: '0.95em',
          lineHeight: 1.15,
          whiteSpace: 'normal',
          cursor: 'pointer',
          background: active ? 'var(--sc-surface)' : 'transparent',
          color: active ? 'var(--sc-primary)' : 'var(--sc-muted)',
          fontWeight: active ? 700 : 600,
          boxShadow: active ? 'var(--sc-shadow-1)' : 'none',
        };
        return (
          <button
            key={o.value}
            type="button"
            className="sc-foc"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            style={style}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
