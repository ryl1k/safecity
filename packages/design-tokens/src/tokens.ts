// SafeCity design tokens (TS mirror of themes.css). Standard theme values + structure.
// Web consumes themes.css via CSS variables; this module gives type-safe access and feeds
// the Tailwind preset + (later) the React Native theme object. Keep in sync with themes.css.

export const fontFamily = '"Onest", system-ui, "Segoe UI", sans-serif';

export const radius = {
  sm: '0.4em',
  md: '0.6em',
  lg: '0.8em',
  xl: '1em',
  pill: '2em',
} as const;

// Spacing scale — step of 4 (design uses em-relative spacing on a 16px base).
export const space = {
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  6: '1.5rem',
  8: '2rem',
} as const;

export const type = {
  display: { size: '2.125rem', weight: 800 }, // 34/800
  heading: { size: '1.5rem', weight: 700 },   // 24/700
  body: { size: '1rem', weight: 400 },        // 16/400
  caption: { size: '0.875rem', weight: 600 }, // 14/600
} as const;

// Token names → CSS variable. Use cssVar('primary') => 'var(--sc-primary)'.
export const cssVar = (name: string) => `var(--sc-${name})` as const;

// Standard-theme literal values (for non-CSS consumers e.g. React Native, charts, canvas).
export const standard = {
  bg: '#eef1f2', surface: '#fff', surface2: '#f4f6f7',
  text: '#16242b', muted: '#6a787f',
  border: '#e3e8ea', borderStrong: '#cdd5d9',
  primary: '#0d5b66', primaryStrong: '#093f47', primaryTint: '#e6eff1', onPrimary: '#fff',
  accent: '#b5512a', accentStrong: '#8d3d1d',
  ok: '#1f7a44', okBg: '#e8f2ec', okLine: '#9ccbae',
  warn: '#8a5a00', warnBg: '#f7eed8', warnLine: '#dcc081',
  bad: '#b3261e', badBg: '#f8e7e5', badLine: '#e3a8a2',
  unk: '#6a787f', unkBg: '#eef1f2', unkLine: '#c2cbcf',
  focus: '#0a66ff',
} as const;

// High-contrast + dark literal palettes (mirror themes.css) for non-CSS consumers
// like React Native. Each spreads `standard` and overrides what the CSS theme sets.
export const contrast = {
  ...standard,
  bg: '#fff', surface: '#fff', surface2: '#fff',
  text: '#000', muted: '#1a1f22',
  border: '#000', borderStrong: '#000',
  primary: '#00343c', primaryStrong: '#00222a', primaryTint: '#dbeaec',
  accent: '#7e2c0c',
  ok: '#0d5b2c', okBg: '#d7eede', okLine: '#0d5b2c',
  warn: '#6e4600', warnBg: '#fbe9c4', warnLine: '#6e4600',
  bad: '#8c0f0a', badBg: '#fbdcd9', badLine: '#8c0f0a',
  unk: '#2a3034', unkBg: '#e6e9eb', unkLine: '#2a3034',
} as const;

export const dark = {
  ...standard,
  bg: '#0d1417', surface: '#16242a', surface2: '#1c2e35',
  text: '#eef4f5', muted: '#a6b6bc',
  border: '#26373d', borderStrong: '#3c525a',
  primary: '#4fb6c2', primaryStrong: '#71c8d2', primaryTint: '#14323a', onPrimary: '#04222a',
  accent: '#e58a5f',
  ok: '#67d08c', okBg: '#143126', okLine: '#2f6b48',
  warn: '#e3b65a', warnBg: '#34290f', warnLine: '#6e561f',
  bad: '#f3938b', badBg: '#371b19', badLine: '#7a3a35',
  unk: '#9fadb3', unkBg: '#1e2b31', unkLine: '#3c525a',
} as const;

// Structural palette type (string values) so all three themes are interchangeable.
export type Palette = Record<keyof typeof standard, string>;

// All palettes + the per-theme base font scale (matches --sc-scale in themes.css).
export const palettes = { standard, contrast, dark } as const;
export const themeScale = { standard: 1, contrast: 1.14, dark: 1 } as const;

// Rating → icon + label (color comes from the matching CSS vars). Never color alone.
export const rating = {
  full:    { key: 'ok',   icon: '✓', label: 'Доступно' },
  partial: { key: 'warn', icon: '◑', label: 'Частково' },
  none:    { key: 'bad',  icon: '✕', label: 'Недоступно' },
  unknown: { key: 'unk',  icon: '?', label: 'Невідомо' },
} as const;

// Category → pin shape (rating provides color+icon; category provides shape).
export const categoryShape = {
  venue: 'circle',
  transit: 'square',
  crossing: 'diamond',
  toilet: 'pentagon',
  parking: 'hexagon',
} as const;

export type ThemeName = 'standard' | 'contrast' | 'dark';
export type RatingKey = keyof typeof rating;
export type CategoryKey = keyof typeof categoryShape;
