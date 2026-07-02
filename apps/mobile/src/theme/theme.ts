// RN theme surface. Colors come reactively from useTheme().palette (3 themes via
// @safecity/design-tokens). Spacing/type/radius are static numeric scales.
import { categoryShape, fontFamily, rating } from '@safecity/design-tokens';

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 6, md: 10, lg: 14, pill: 999 } as const;
export const fontSize = { display: 32, heading: 22, title: 18, body: 16, caption: 13 } as const;

export { rating as ratingMeta, categoryShape, fontFamily };
export { ThemeProvider, useTheme } from './ThemeProvider';
export type { ThemeName, Palette } from '@safecity/design-tokens';
