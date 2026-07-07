'use client';

import { Search } from 'lucide-react';

/** A titled card panel for one moderation list. `count` shows the (filtered) size;
 * `toolbar` renders search/filter controls under the heading. */
export function AdminPanel({
  title,
  count,
  description,
  toolbar,
  children,
}: {
  title: string;
  count?: number;
  description?: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '1.3em' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6em', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: '1.35em', fontWeight: 800 }}>{title}</h1>
        {count != null && (
          <span style={{ fontWeight: 800, fontSize: '0.9em', color: 'var(--sc-primary)', background: 'var(--sc-primary-tint)', borderRadius: '2em', padding: '0.1em 0.7em' }}>
            {count}
          </span>
        )}
      </div>
      {description && <p style={{ margin: '0.4em 0 0', color: 'var(--sc-muted)', fontSize: '0.9em' }}>{description}</p>}
      {toolbar && <div style={{ margin: '1em 0 0.2em', display: 'flex', gap: '0.6em', flexWrap: 'wrap', alignItems: 'center' }}>{toolbar}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6em', marginTop: '1em' }}>{children}</div>
    </section>
  );
}

/** Debounce-free live search box. */
export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
      <Search size={15} aria-hidden style={{ position: 'absolute', left: '0.7em', top: '50%', transform: 'translateY(-50%)', color: 'var(--sc-muted)', pointerEvents: 'none' }} />
      <input
        className="sc-foc"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{
          width: '100%', padding: '0.5em 0.7em 0.5em 2.1em', borderRadius: '0.6em',
          border: 'var(--sc-bw) solid var(--sc-border-strong)', background: 'var(--sc-surface)',
          color: 'var(--sc-text)', fontFamily: 'inherit', fontSize: '0.9em',
        }}
      />
    </div>
  );
}

/** Segmented single-select filter (e.g. status, star rating). */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} style={{ display: 'inline-flex', gap: '0.3em', flexWrap: 'wrap' }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            className="sc-foc"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            style={{
              padding: '0.42em 0.75em', borderRadius: '0.6em', cursor: 'pointer', fontWeight: 700, fontSize: '0.82em',
              border: 'var(--sc-bw) solid ' + (active ? 'var(--sc-primary)' : 'var(--sc-border-strong)'),
              background: active ? 'var(--sc-primary-tint)' : 'transparent',
              color: active ? 'var(--sc-primary)' : 'var(--sc-text)',
              fontFamily: 'inherit',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function AdminRow({ children }: { children: React.ReactNode }) {
  return <div className="sc-admin-row">{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '0.4em 0', color: 'var(--sc-muted)', fontSize: '0.9em' }}>{children}</p>;
}

export const btnCol = { display: 'flex', gap: '0.35em', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' } as const;
export const smallBtn = { minHeight: '2.2em', fontSize: '0.82em', padding: '0 0.7em' } as const;
