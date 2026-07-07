import type { Config } from 'tailwindcss';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const preset = require('@safecity/design-tokens/tailwind-preset.cjs');

const config: Config = {
  presets: [preset],
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
