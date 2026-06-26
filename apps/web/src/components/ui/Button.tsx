import type { ButtonHTMLAttributes, CSSProperties } from 'react';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

const base: CSSProperties = {
  minHeight: '2.75em',
  padding: '0 1.3em',
  borderRadius: '0.7em',
  fontWeight: 700,
  fontFamily: 'inherit',
  fontSize: '1em',
  cursor: 'pointer',
  display: 'inline-grid',
  placeItems: 'center',
  border: 'var(--sc-bw) solid transparent',
  lineHeight: 1.1,
};

const variants: Record<Variant, CSSProperties> = {
  primary: { background: 'var(--sc-primary)', color: 'var(--sc-on-primary)', border: 'none' },
  accent: { background: 'var(--sc-accent)', color: '#fff', border: 'none' },
  secondary: {
    background: 'var(--sc-surface)',
    color: 'var(--sc-primary)',
    border: 'var(--sc-bw) solid var(--sc-primary)',
  },
  ghost: { background: 'transparent', color: 'var(--sc-primary)', border: 'none' },
  danger: {
    background: 'var(--sc-surface)',
    color: 'var(--sc-bad)',
    border: 'var(--sc-bw) solid var(--sc-bad)',
  },
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
}

export function Button({ variant = 'primary', block, style, className, ...rest }: ButtonProps) {
  const disabledStyle: CSSProperties = rest.disabled
    ? { opacity: 0.6, cursor: 'not-allowed' }
    : {};
  return (
    <button
      className={['sc-foc', className].filter(Boolean).join(' ')}
      style={{
        ...base,
        ...variants[variant],
        ...(block ? { width: '100%' } : {}),
        ...disabledStyle,
        ...style,
      }}
      {...rest}
    />
  );
}
