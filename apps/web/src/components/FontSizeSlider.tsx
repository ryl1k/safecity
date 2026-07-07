'use client';

import { MIN_SCALE, MAX_SCALE, useTheme } from '@/theme/ThemeProvider';

/** Continuous text-size control. Applies live and persists across the app. */
export function FontSizeSlider() {
  const { fontScale, setFontScale } = useTheme();
  const pct = Math.round(fontScale * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em' }}>
      <span aria-hidden style={{ fontSize: '0.85em', color: 'var(--sc-muted)' }}>А</span>
      <input
        type="range"
        min={MIN_SCALE}
        max={MAX_SCALE}
        step={0.05}
        value={fontScale}
        onChange={(e) => setFontScale(parseFloat(e.target.value))}
        aria-label="Розмір тексту"
        aria-valuetext={`${pct} відсотків`}
        className="sc-foc"
        style={{ flex: 1, minWidth: 0, accentColor: 'var(--sc-primary)', cursor: 'pointer' }}
      />
      <span aria-hidden style={{ fontSize: '1.5em', color: 'var(--sc-muted)', lineHeight: 1 }}>А</span>
      <span style={{ minWidth: '3.2em', textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
    </div>
  );
}
