'use client';

import { useState } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import type { RoutePrefs } from '@/lib/routePrefs';
import { routePrefsActive } from '@/lib/routePrefs';

const WIDTHS: { v: number; label: string }[] = [
  { v: 0, label: 'Будь-яка' },
  { v: 0.9, label: '≥ 0.9 м' },
  { v: 1.2, label: '≥ 1.2 м' },
  { v: 1.5, label: '≥ 1.5 м' },
];
const INCLINES: { v: number; label: string }[] = [
  { v: 0, label: 'Будь-який' },
  { v: 6, label: '≤ 6%' },
  { v: 8, label: '≤ 8%' },
  { v: 10, label: '≤ 10%' },
];

/** Wheelchair routing preferences — min width, max incline, kerbs and a strict
 * "avoid marginal segments" toggle. Controlled; the parent persists + reroutes. */
export function RoutePrefsControl({ value, onChange }: { value: RoutePrefs; onChange: (p: RoutePrefs) => void }) {
  const [open, setOpen] = useState(false);
  const active = routePrefsActive(value);

  return (
    <div style={{ border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.7em', background: 'var(--sc-surface)' }}>
      <button
        type="button"
        className="sc-foc"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5em', width: '100%', minHeight: '2.6em',
          padding: '0 0.8em', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          fontWeight: 700, fontSize: '0.9em', color: 'var(--sc-text)',
        }}
      >
        <SlidersHorizontal size={16} aria-hidden />
        <span style={{ flex: 1, textAlign: 'left' }}>Параметри доступності</span>
        {active && <span aria-label="активні" style={{ width: '0.5em', height: '0.5em', borderRadius: '50%', background: 'var(--sc-primary)' }} />}
        <ChevronDown size={16} aria-hidden style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{ padding: '0.2em 0.8em 0.9em', display: 'flex', flexDirection: 'column', gap: '0.9em' }}>
          <Segmented
            label="Мінімальна ширина"
            options={WIDTHS}
            value={value.minWidth}
            onChange={(v) => onChange({ ...value, minWidth: v })}
          />
          <Segmented
            label="Макс. нахил"
            options={INCLINES}
            value={value.maxIncline}
            onChange={(v) => onChange({ ...value, maxIncline: v })}
          />
          <Toggle
            label="Уникати високих бордюрів"
            checked={value.avoidKerbs}
            onChange={(c) => onChange({ ...value, avoidKerbs: c })}
          />
          <Toggle
            label="Уникати складних ділянок"
            hint="Оминати не лише непрохідні, а й частково доступні відрізки"
            checked={value.strict}
            onChange={(c) => onChange({ ...value, strict: c })}
          />
        </div>
      )}
    </div>
  );
}

function Segmented({ label, options, value, onChange }: { label: string; options: { v: number; label: string }[]; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div style={{ fontSize: '0.78em', fontWeight: 700, color: 'var(--sc-muted)', marginBottom: '0.35em' }}>{label}</div>
      <div role="group" aria-label={label} style={{ display: 'flex', gap: '0.3em', flexWrap: 'wrap' }}>
        {options.map((o) => {
          const on = o.v === value;
          return (
            <button
              key={o.v}
              type="button"
              className="sc-foc"
              aria-pressed={on}
              onClick={() => onChange(o.v)}
              style={{
                padding: '0.4em 0.7em', borderRadius: '0.55em', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.82em',
                border: 'var(--sc-bw) solid ' + (on ? 'var(--sc-primary)' : 'var(--sc-border-strong)'),
                background: on ? 'var(--sc-primary-tint)' : 'transparent',
                color: on ? 'var(--sc-primary)' : 'var(--sc-text)',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="sc-foc"
      onClick={() => onChange(!checked)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6em', width: '100%', padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
    >
      <span aria-hidden style={{ flexShrink: 0, marginTop: '0.1em', width: '2.3em', height: '1.3em', borderRadius: '1em', background: checked ? 'var(--sc-primary)' : 'var(--sc-border-strong)', position: 'relative', transition: 'background 0.15s' }}>
        <span style={{ position: 'absolute', top: '0.15em', left: checked ? '1.15em' : '0.15em', width: '1em', height: '1em', borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ fontWeight: 700, fontSize: '0.88em', color: 'var(--sc-text)' }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: '0.78em', color: 'var(--sc-muted)', marginTop: '0.1em' }}>{hint}</span>}
      </span>
    </button>
  );
}
