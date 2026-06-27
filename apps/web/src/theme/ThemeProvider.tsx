'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ThemeName } from '@safecity/design-tokens';

export const MIN_SCALE = 0.85;
export const MAX_SCALE = 1.8;
export const DEFAULT_SCALE = 1;

export function clampScale(n: number): number {
  if (Number.isNaN(n)) return DEFAULT_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(n * 100) / 100));
}

interface ThemeCtx {
  theme: ThemeName;
  /** User font-size multiplier (on top of the per-theme scale). */
  fontScale: number;
  setTheme: (t: ThemeName) => void;
  setFontScale: (n: number) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('standard');
  const [fontScale, setFontScaleState] = useState(DEFAULT_SCALE);

  // Sync from the pre-paint values the inline script already applied.
  useEffect(() => {
    const el = document.documentElement;
    setThemeState((el.getAttribute('data-theme') as ThemeName) || 'standard');
    const fromVar = parseFloat(el.style.getPropertyValue('--sc-user-scale'));
    if (!Number.isNaN(fromVar)) {
      setFontScaleState(clampScale(fromVar));
    } else {
      try {
        const s = parseFloat(localStorage.getItem('sc-font-scale') || '');
        if (!Number.isNaN(s)) setFontScaleState(clampScale(s));
      } catch {}
    }
  }, []);

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
    try {
      localStorage.setItem('sc-theme', t);
    } catch {}
  }, []);

  const setFontScale = useCallback((n: number) => {
    const v = clampScale(n);
    setFontScaleState(v);
    document.documentElement.style.setProperty('--sc-user-scale', String(v));
    try {
      localStorage.setItem('sc-font-scale', String(v));
    } catch {}
  }, []);

  return <Ctx.Provider value={{ theme, fontScale, setTheme, setFontScale }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
