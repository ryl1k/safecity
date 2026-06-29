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

export const MIN_SCALE = 0.85;
export const MAX_SCALE = 1.8;
export const DEFAULT_SCALE = 1;

export function clampScale(n: number): number {
  if (Number.isNaN(n)) return DEFAULT_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(n * 100) / 100));
}

const THEME_KEY = 'sc-theme';
const SCALE_KEY = 'sc-font-scale';

interface ThemeCtx {
  themeName: ThemeName;
  palette: Palette;
  /** User font-size slider. */
  fontScale: number;
  /** Per-theme base scale × the user slider — multiply text sizes by this. */
  baseScale: number;
  setTheme: (t: ThemeName) => void;
  setFontScale: (n: number) => void;
  ready: boolean;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>('standard');
  const [fontScale, setFontScaleState] = useState(DEFAULT_SCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem(THEME_KEY);
        if (t === 'standard' || t === 'contrast' || t === 'dark') setThemeName(t);
        const s = parseFloat((await AsyncStorage.getItem(SCALE_KEY)) ?? '');
        if (!Number.isNaN(s)) setFontScaleState(clampScale(s));
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

  const setFontScale = useCallback((n: number) => {
    const v = clampScale(n);
    setFontScaleState(v);
    AsyncStorage.setItem(SCALE_KEY, String(v)).catch(() => {});
  }, []);

  const value = useMemo<ThemeCtx>(
    () => ({
      themeName,
      palette: palettes[themeName],
      fontScale,
      baseScale: themeScale[themeName] * fontScale,
      setTheme,
      setFontScale,
      ready,
    }),
    [themeName, fontScale, ready, setTheme, setFontScale],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
