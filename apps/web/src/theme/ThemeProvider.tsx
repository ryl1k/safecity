'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ThemeName } from '@safecity/design-tokens';

type Big = '0' | '1';

interface ThemeCtx {
  theme: ThemeName;
  big: Big;
  setTheme: (t: ThemeName) => void;
  toggleBig: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('standard');
  const [big, setBig] = useState<Big>('0');

  // Sync from the pre-paint values the inline script already applied.
  useEffect(() => {
    const el = document.documentElement;
    setThemeState((el.getAttribute('data-theme') as ThemeName) || 'standard');
    setBig((el.getAttribute('data-big') as Big) || '0');
  }, []);

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
    try {
      localStorage.setItem('sc-theme', t);
    } catch {}
  }, []);

  const toggleBig = useCallback(() => {
    setBig((prev) => {
      const next: Big = prev === '1' ? '0' : '1';
      document.documentElement.setAttribute('data-big', next);
      try {
        localStorage.setItem('sc-big', next);
      } catch {}
      return next;
    });
  }, []);

  return (
    <Ctx.Provider value={{ theme, big, setTheme, toggleBig }}>{children}</Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
