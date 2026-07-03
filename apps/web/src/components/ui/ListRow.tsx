import type { CSSProperties, ReactNode } from 'react';
import { rating, type RatingKey } from '@safecity/design-tokens';
import { RatingDot } from './RatingBadge';

export interface ListRowProps {
  name: string;
  /** Omit (or pass 'unknown') to hide the rating — discovery-first list. */
  rating?: RatingKey;
  /** Leading icon (category) shown when the rating is hidden. */
  icon?: ReactNode;
  /** Average review stars (1–5) — shown only when the point has reviews. */
  stars?: number;
  /** e.g. "Кафе · 40 м · на 2 годині · без сходів, туалет" */
  meta: string;
  /** Optional explicit screen-reader phrase; composed from props if omitted. */
  ariaLabel?: string;
  onClick?: () => void;
}

/**
 * The audio-first list primitive. Carries a rich aria-label so a screen reader
 * announces name + status + distance + direction in one pass (KB 02 blind list).
 */
export function ListRow({ name, rating: r, icon, stars, meta, ariaLabel, onClick }: ListRowProps) {
  const hasRating = !!r && r !== 'unknown';
  const meta_ = hasRating ? rating[r] : null;
  const starText = stars != null ? `, ${stars.toFixed(1)} з 5 зірок` : '';
  const label = ariaLabel ?? (meta_ ? `${name}, ${meta_.label}${starText}, ${meta}` : `${name}${starText}, ${meta}`);
  const btn: CSSProperties = {
    display: 'flex',
    width: '100%',
    boxSizing: 'border-box',
    textAlign: 'left',
    gap: '0.9em',
    alignItems: 'center',
    padding: '0.9em',
    background: 'transparent',
    border: 'none',
    borderRadius: '0.8em',
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: 'var(--sc-text)',
  };
  return (
    <button className="sc-foc" aria-label={label} onClick={onClick} style={btn}>
      {meta_ ? (
        <RatingDot rating={r as RatingKey} size={2.6} />
      ) : (
        <span aria-hidden style={{ fontSize: '1.4em', width: '1.6em', textAlign: 'center', flexShrink: 0 }}>
          {icon ?? '•'}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: '1.02em' }}>{name}</span>
          {meta_ ? (
            <span style={{ fontSize: '0.78em', fontWeight: 800, color: `var(--sc-${meta_.key})` }}>{meta_.label}</span>
          ) : null}
          {stars != null ? (
            <span aria-hidden style={{ fontSize: '0.8em', fontWeight: 800, color: 'var(--sc-warn)' }}>
              ★ {stars.toFixed(1)}
            </span>
          ) : null}
        </span>
        <span style={{ display: 'block', color: 'var(--sc-muted)', fontSize: '0.85em', marginTop: '0.15em' }}>
          {meta}
        </span>
      </span>
      <span aria-hidden style={{ color: 'var(--sc-muted)', fontSize: '1.3em', flexShrink: 0 }}>
        ›
      </span>
    </button>
  );
}
