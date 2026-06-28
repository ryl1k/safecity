// RN theme adapter over @safecity/design-tokens. Colors come straight from the
// token palettes (hex → RN-native); spacing/type/radius are numeric scales
// matching the tokens' px comments. A full provider (3 themes + fontScale +
// AsyncStorage) is the next step; for now the standard palette is active.
import { categoryShape, fontFamily, rating, standard } from '@safecity/design-tokens';

// Only `standard` ships as a JS palette today (contrast/dark live in themes.css).
// Port those to JS objects when the multi-theme provider lands.
export const palettes = { standard, contrast: standard, dark: standard } as const;
export type ThemeName = keyof typeof palettes;

// Active palette (standard until the theme provider lands).
export const theme = standard;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 6, md: 10, lg: 14, pill: 999 } as const;
export const fontSize = { display: 32, heading: 22, title: 18, body: 16, caption: 13 } as const;

export { rating as ratingMeta, categoryShape, fontFamily };
