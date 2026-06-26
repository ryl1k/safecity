import type { CSSProperties } from 'react';

export type FeatureValue = 'yes' | 'no' | 'unknown';

const meta: Record<FeatureValue, { key: string; icon: string; label: string }> = {
  yes: { key: 'ok', icon: '✓', label: 'Так' },
  no: { key: 'bad', icon: '✕', label: 'Ні' },
  unknown: { key: 'unk', icon: '?', label: 'Невідомо' },
};

export interface ChecklistRowProps {
  label: string;
  value: FeatureValue;
  /** Whether this feature is critical for the active profile's rating. */
  critical?: boolean;
  last?: boolean;
}

export function ChecklistRow({ label, value, critical, last }: ChecklistRowProps) {
  const m = meta[value];
  const row: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.7em',
    padding: '0.6em 0',
    borderBottom: last ? 'none' : 'var(--sc-bw) solid var(--sc-border)',
  };
  return (
    <div style={row}>
      <span
        aria-hidden
        style={{
          width: '1.7em', height: '1.7em', borderRadius: '0.4em',
          background: `var(--sc-${m.key})`, color: '#fff',
          display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '0.8em',
        }}
      >
        {m.icon}
      </span>
      <span style={{ flex: 1, fontWeight: 600, fontSize: '0.92em' }}>
        {label}
        {critical ? <span aria-label="критична зручність" style={{ color: 'var(--sc-accent)' }}> ★</span> : null}
      </span>
      <span style={{ fontSize: '0.78em', color: `var(--sc-${m.key})`, fontWeight: 800 }}>{m.label}</span>
    </div>
  );
}
