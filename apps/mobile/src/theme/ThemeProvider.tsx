import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { palettes, themeScale, type Palette, type ThemeName } from '@safecity/design-tokens';

const THEME_KEY = 'sc-theme';

interface ThemeCtx {
  themeName: ThemeName;
  palette: Palette;
  /**
   * Per-theme base scale — multiply text sizes by this. SafeCity is
   * wheelchair/mobility-only now, so the user font-size slider was removed;
   * this is just the theme's fixed scale (font scale is pinned at 100%).
   */
  baseScale: number;
  setTheme: (t: ThemeName) => void;
  ready: boolean;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>('standard');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem(THEME_KEY);
        if (t === 'standard' || t === 'contrast' || t === 'dark') setThemeName(t);
      } catch {
        // first run / storage unavailable — defaults are fine
      }
      setReady(true);
    })();
  }, []);

  const setTheme = useCallback((t: ThemeName) => {
    setThemeName(t);
    AsyncStorage.setItem(THEME_KEY, t).catch(() => {});
  }, []);

  const value = useMemo<ThemeCtx>(
    () => ({
      themeName,
      palette: palettes[themeName],
      baseScale: themeScale[themeName],
      setTheme,
      ready,
    }),
    [themeName, ready, setTheme],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
