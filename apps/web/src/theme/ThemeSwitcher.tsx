'use client';

import type { ThemeName } from '@safecity/design-tokens';
import { useTheme } from './ThemeProvider';

const THEMES: { key: ThemeName; label: string }[] = [
  { key: 'standard', label: 'Стандарт' },
  { key: 'contrast', label: 'Контраст' },
  { key: 'dark', label: 'Темна' },
];

export function ThemeSwitcher() {
  const { theme, big, setTheme, toggleBig } = useTheme();

  return (
    <div className="flex items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Тема"
        className="inline-flex rounded-md border border-border bg-surface-2 p-1"
      >
        {THEMES.map((t) => {
          const active = theme === t.key;
          return (
            <button
              key={t.key}
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(t.key)}
              className={[
                'min-h-[2.4em] rounded px-3 text-sm font-semibold',
                active ? 'bg-primary text-primary-on' : 'bg-transparent text-muted',
              ].join(' ')}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <button
        aria-pressed={big === '1'}
        onClick={toggleBig}
        className={[
          'min-h-[2.4em] rounded-md border border-strong px-3 text-sm font-semibold text-text',
          big === '1' ? 'bg-primary-tint' : 'bg-surface',
        ].join(' ')}
      >
        200% тексту
      </button>
    </div>
  );
}
