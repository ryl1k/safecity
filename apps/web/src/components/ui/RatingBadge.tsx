import type { CSSProperties } from 'react';
import { rating, type RatingKey } from '@safecity/design-tokens';

// Full screen-reader phrase per rating, e.g. "Доступно — повний доступ".
const descriptor: Record<RatingKey, string> = {
  full: 'повний доступ',
  partial: 'частковий доступ',
  none: 'перекрито',
  unknown: 'немає даних',
};

function vars(key: string) {
  return {
    fg: `var(--sc-${key})`,
    bg: `var(--sc-${key}-bg)`,
    line: `var(--sc-${key}-line)`,
  };
}

export interface RatingBadgeProps {
  rating: RatingKey;
  size?: 'sm' | 'md';
}

/** Pill badge — color + icon + label, announced as one phrase. Never color alone. */
export function RatingBadge({ rating: r, size = 'md' }: RatingBadgeProps) {
  const meta = rating[r];
  const c = vars(meta.key);
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4em',
    background: c.bg,
    color: c.fg,
    border: `var(--sc-bw) solid ${c.line}`,
    borderRadius: '2em',
    padding: size === 'sm' ? '0.25em 0.6em' : '0.35em 0.8em',
    fontWeight: 800,
    fontSize: size === 'sm' ? '0.78em' : '0.9em',
  };
  return (
    <span role="img" aria-label={`${meta.label} — ${descriptor[r]}`} style={style}>
      <span aria-hidden>{meta.icon}</span> {meta.label}
    </span>
  );
}

export interface RatingDotProps {
  rating: RatingKey;
  /** em size of the circle */
  size?: number;
  /** when true the dot carries the label itself; otherwise it is decorative */
  standalone?: boolean;
}

/** Circular icon dot. Decorative by default (pair with text); set standalone to announce. */
export function RatingDot({ rating: r, size = 1.8, standalone }: RatingDotProps) {
  const meta = rating[r];
  const style: CSSProperties = {
    width: `${size}em`,
    height: `${size}em`,
    borderRadius: '50%',
    background: `var(--sc-${meta.key})`,
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 800,
    fontSize: '0.85em',
    flexShrink: 0,
  };
  return (
    <span
      role={standalone ? 'img' : undefined}
      aria-label={standalone ? `${meta.label} — ${descriptor[r]}` : undefined}
      aria-hidden={standalone ? undefined : true}
      style={style}
    >
      {meta.icon}
    </span>
  );
}
