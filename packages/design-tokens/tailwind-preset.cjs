/* SafeCity Tailwind preset — maps utilities onto the CSS variables in themes.css,
 * so Tailwind classes (bg-primary, text-muted, border-strong, etc.) follow the active theme.
 * Usage in apps/web/tailwind.config: { presets: [require('@safecity/design-tokens/tailwind-preset.cjs')] }
 */
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Onest', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        bg: 'var(--sc-bg)',
        surface: { DEFAULT: 'var(--sc-surface)', 2: 'var(--sc-surface-2)' },
        text: 'var(--sc-text)',
        muted: 'var(--sc-muted)',
        border: { DEFAULT: 'var(--sc-border)', strong: 'var(--sc-border-strong)' },
        primary: {
          DEFAULT: 'var(--sc-primary)',
          strong: 'var(--sc-primary-strong)',
          tint: 'var(--sc-primary-tint)',
          on: 'var(--sc-on-primary)',
        },
        accent: { DEFAULT: 'var(--sc-accent)', strong: 'var(--sc-accent-strong)' },
        ok: { DEFAULT: 'var(--sc-ok)', bg: 'var(--sc-ok-bg)', line: 'var(--sc-ok-line)' },
        warn: { DEFAULT: 'var(--sc-warn)', bg: 'var(--sc-warn-bg)', line: 'var(--sc-warn-line)' },
        bad: { DEFAULT: 'var(--sc-bad)', bg: 'var(--sc-bad-bg)', line: 'var(--sc-bad-line)' },
        unk: { DEFAULT: 'var(--sc-unk)', bg: 'var(--sc-unk-bg)', line: 'var(--sc-unk-line)' },
        focus: 'var(--sc-focus)',
      },
      borderRadius: {
        sm: '0.4rem', md: '0.6rem', lg: '0.8rem', xl: '1rem', pill: '2rem',
      },
      boxShadow: {
        1: 'var(--sc-shadow-1)',
        2: 'var(--sc-shadow-2)',
      },
    },
  },
};
