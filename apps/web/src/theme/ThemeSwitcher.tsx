'use client';

import type { ThemeName } from '@safecity/design-tokens';
import { useTheme } from './ThemeProvider';

const THEMES: { key: ThemeName; label: string }[] = [
  { key: 'standard', label: 'Стандартна' },
  { key: 'contrast', label: 'Контрастна' },
  { key: 'dark', label: 'Темна' },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div role="radiogroup" aria-label="Тема" style={{ display: 'flex', gap: '0.4em', flexWrap: 'wrap' }}>
      {THEMES.map((t) => {
          const active = theme === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={active}
              className="sc-foc"
              onClick={() => setTheme(t.key)}
              style={{
                minHeight: '2.6em', padding: '0 1em', borderRadius: '0.6em', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
                border: `var(--sc-bw) solid ${active ? 'var(--sc-primary)' : 'var(--sc-border-strong)'}`,
                background: active ? 'var(--sc-primary)' : 'var(--sc-surface)',
                color: active ? 'var(--sc-on-primary)' : 'var(--sc-text)',
              }}
            >
              {t.label}
            </button>
          );
        })}
    </div>
  );
}
