import type { CSSProperties } from 'react';
import { rating, type RatingKey } from '@safecity/design-tokens';
import { RatingDot } from './RatingBadge';

export interface ListRowProps {
  name: string;
  rating: RatingKey;
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
export function ListRow({ name, rating: r, meta, ariaLabel, onClick }: ListRowProps) {
  const meta_ = rating[r];
  const label = ariaLabel ?? `${name}, ${meta_.label}, ${meta}`;
  const btn: CSSProperties = {
    display: 'flex',
    width: '100%',
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
      <RatingDot rating={r} size={2.6} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: '1.02em' }}>{name}</span>
          <span style={{ fontSize: '0.78em', fontWeight: 800, color: `var(--sc-${meta_.key})` }}>
            {meta_.label}
          </span>
        </span>
        <span style={{ display: 'block', color: 'var(--sc-muted)', fontSize: '0.85em', marginTop: '0.15em' }}>
          {meta}
        </span>
      </span>
      <span aria-hidden style={{ color: 'var(--sc-muted)', fontSize: '1.3em' }}>
        ›
      </span>
    </button>
  );
}
