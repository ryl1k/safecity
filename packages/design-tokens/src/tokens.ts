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
