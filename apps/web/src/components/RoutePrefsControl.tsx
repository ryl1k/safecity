'use client';

import { useState } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import type { RoutePrefs } from '@/lib/routePrefs';
import { routePrefsActive } from '@/lib/routePrefs';

const INCLINES: { v: number; label: string }[] = [
  { v: 0, label: 'Будь-який' },
  { v: 6, label: '≤ 6%' },
  { v: 8, label: '≤ 8%' },
  { v: 10, label: '≤ 10%' },
];

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
          <div>
            <div style={{ fontSize: '0.78em', fontWeight: 700, color: 'var(--sc-muted)', marginBottom: '0.35em' }}>Макс. нахил</div>
            <div role="group" aria-label="Макс. нахил" style={{ display: 'flex', gap: '0.3em', flexWrap: 'wrap' }}>
              {INCLINES.map((o) => {
                const on = o.v === value.maxIncline;
                return (
                  <button
                    key={o.v}
                    type="button"
                    className="sc-foc"
                    aria-pressed={on}
                    onClick={() => onChange({ ...value, maxIncline: o.v })}
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
        </div>
      )}
    </div>
  );
}
