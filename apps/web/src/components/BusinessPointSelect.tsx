'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, MapPin, Check } from 'lucide-react';
import type { AccessibilityFeature } from '@safecity/shared';
import { accessLevel } from '@safecity/shared';
import { categoryLabel } from '@/lib/format';
import { levelLabel, levelColor } from '@/lib/filters';
import { getCatalog } from '@/lib/catalog';
import type { MyPoint } from '@/lib/business';

/**
 * Persistent point selector shown top-right of the dashboard. A custom dropdown
 * (not a native <select>) so the option list uses the app font — native option
 * lists fall back to the OS font on Windows. Shows the selected point's category
 * and accessibility level below.
 */
export function BusinessPointSelect({ points, value, onChange }: { points: MyPoint[]; value: string | null; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { void getCatalog().then(setCatalog).catch(() => {}); }, []);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const sel = points.find((p) => p.id === value) ?? points[0];
  if (!sel) return null;
  const cat = categoryLabel[sel.category as keyof typeof categoryLabel] ?? sel.category;
  const lvl = catalog.length ? accessLevel(sel.features, catalog, sel.category) : null;
  const single = points.length <= 1;

  return (
    <div ref={boxRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3em', minWidth: 0 }}>
      <button
        type="button"
        disabled={single}
        onClick={() => setOpen((o) => !o)}
        className="sc-foc"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Обрана точка"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.5em', maxWidth: 'min(72vw, 320px)',
          background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border-strong)', borderRadius: '0.7em',
          padding: '0.5em 0.8em', cursor: single ? 'default' : 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '1.02em', color: 'var(--sc-text)',
        }}
      >
        <MapPin size={16} aria-hidden style={{ color: 'var(--sc-primary)', flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sel.name}</span>
        {!single && <ChevronDown size={16} aria-hidden style={{ flexShrink: 0, color: 'var(--sc-muted)' }} />}
      </button>

      <div style={{ display: 'flex', gap: '0.6em', alignItems: 'center', fontSize: '0.8em', color: 'var(--sc-muted)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span>{cat}</span>
        {lvl && (
          <span style={{ color: levelColor[lvl], fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3em' }}>
            <span aria-hidden style={{ width: '0.5em', height: '0.5em', borderRadius: '50%', background: levelColor[lvl] }} />
            {levelLabel[lvl]}
          </span>
        )}
        {sel.address && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>· {sel.address}</span>}
      </div>

      {open && !single && (
        <ul
          role="listbox"
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: '0.3em', zIndex: 30, listStyle: 'none', padding: '0.3em',
            minWidth: 'min(82vw, 280px)', background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border-strong)',
            borderRadius: '0.7em', boxShadow: '0 10px 30px rgba(0,0,0,0.18)', maxHeight: '16em', overflowY: 'auto',
          }}
        >
          {points.map((p) => {
            const pl = catalog.length ? accessLevel(p.features, catalog, p.category) : null;
            const on = p.id === (value ?? sel.id);
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={on}
                onClick={() => { onChange(p.id); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5em', padding: '0.55em 0.6em', borderRadius: '0.5em', cursor: 'pointer',
                  fontSize: '0.92em', fontWeight: on ? 800 : 600, background: on ? 'var(--sc-surface-2)' : 'transparent',
                }}
              >
                {pl && <span aria-hidden style={{ width: '0.55em', height: '0.55em', borderRadius: '50%', background: levelColor[pl], flexShrink: 0 }} />}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                {on && <Check size={15} aria-hidden style={{ color: 'var(--sc-primary)', flexShrink: 0 }} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
