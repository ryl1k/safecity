'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SlidersHorizontal, Check } from 'lucide-react';
import type { ThemeName } from '@safecity/design-tokens';
import { useTheme } from '@/theme/ThemeProvider';

const THEMES: { key: ThemeName; label: string }[] = [
  { key: 'standard', label: 'Стандартна' },
  { key: 'contrast', label: 'Контрастна' },
  { key: 'dark', label: 'Темна' },
];

/** Compact appearance popover (theme + text size) — keeps wide controls out of the header. */
export function AccessibilityMenu() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="sc-foc"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Вигляд"
        onClick={() => setOpen((o) => !o)}
        style={triggerStyle}
      >
        <SlidersHorizontal size={18} aria-hidden />
        <span className="sc-hide-sm" style={labelStyle}>Вигляд</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} aria-hidden />
          <div
            role="dialog"
            aria-label="Налаштування вигляду"
            style={{
              position: 'absolute', right: 0, top: 'calc(100% + 0.5em)', zIndex: 41, width: 'min(86vw, 260px)',
              background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
              borderRadius: '0.9em', boxShadow: 'var(--sc-shadow-2)', padding: '0.9em',
            }}
          >
            <div style={sectionLabel}>Тема</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3em', marginBottom: '0.9em' }}>
              {THEMES.map((t) => {
                const active = theme === t.key;
                return (
                  <button
                    key={t.key}
                    className="sc-foc"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTheme(t.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5em', minHeight: '2.6em', padding: '0 0.7em',
                      borderRadius: '0.6em', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, textAlign: 'left',
                      border: `var(--sc-bw) solid ${active ? 'var(--sc-primary)' : 'var(--sc-border)'}`,
                      background: active ? 'var(--sc-primary-tint)' : 'var(--sc-surface)',
                      color: active ? 'var(--sc-primary)' : 'var(--sc-text)',
                    }}
                  >
                    {active ? <Check size={16} aria-hidden /> : <span style={{ width: 16 }} aria-hidden />}
                    {t.label}
                  </button>
                );
              })}
            </div>

            <Link href="/settings" className="sc-foc" onClick={() => setOpen(false)} style={{ display: 'block', marginTop: '0.2em', color: 'var(--sc-primary)', fontWeight: 700, fontSize: '0.85em', textDecoration: 'none' }}>
              Більше налаштувань →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

const triggerStyle = {
  display: 'inline-flex', alignItems: 'center', gap: '0.45em', minHeight: '2.5em', padding: '0 0.8em',
  borderRadius: '0.6em', border: 'var(--sc-bw) solid var(--sc-border-strong)', background: 'var(--sc-surface)',
  color: 'var(--sc-text)', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer',
} as const;
const labelStyle = { fontSize: '0.9em' } as const;
const sectionLabel = { fontSize: '0.72em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sc-muted)', marginBottom: '0.45em' } as const;
