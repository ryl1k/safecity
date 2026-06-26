import type { CSSProperties } from 'react';
import { Button } from './Button';

const card: CSSProperties = {
  background: 'var(--sc-surface)',
  border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em',
  padding: '1.4em',
};

export interface EmptyStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div style={{ ...card, textAlign: 'center' }}>
      <div style={{ fontWeight: 800 }}>{title}</div>
      {message ? (
        <p style={{ fontSize: '0.84em', color: 'var(--sc-muted)', margin: '0.3em 0 0.8em' }}>{message}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button onClick={onAction} style={{ minHeight: '2.6em' }}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

const shimmer: CSSProperties = {
  height: '1em',
  borderRadius: '0.4em',
  background:
    'linear-gradient(90deg,var(--sc-surface-2) 25%, var(--sc-border) 37%, var(--sc-surface-2) 63%)',
  backgroundSize: '200% 100%',
  animation: 'sc-shimmer 1.4s infinite',
};

export interface LoadingStateProps {
  label?: string;
  rows?: number;
}

export function LoadingState({ label = 'Завантаження місць', rows = 3 }: LoadingStateProps) {
  const widths = ['60%', '90%', '75%', '85%', '70%'];
  return (
    <div style={card} aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ ...shimmer, width: widths[i % widths.length], marginTop: i ? '0.6em' : 0 }} />
      ))}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5em', marginTop: '1em',
          color: 'var(--sc-muted)', fontSize: '0.84em', fontWeight: 700,
        }}
      >
        <span
          aria-hidden
          style={{
            width: '1.1em', height: '1.1em', border: '2px solid var(--sc-border)',
            borderTopColor: 'var(--sc-primary)', borderRadius: '50%', display: 'inline-block',
            animation: 'sc-spin .8s linear infinite',
          }}
        />
        Завантаження…
      </div>
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Не вдалося завантажити',
  message = "Перевірте з'єднання й спробуйте ще раз.",
  retryLabel = 'Повторити',
  onRetry,
}: ErrorStateProps) {
  return (
    <div role="alert" style={{ ...card, border: 'var(--sc-bw) solid var(--sc-bad-line)', textAlign: 'center' }}>
      <div
        aria-hidden
        style={{
          width: '2.4em', height: '2.4em', margin: '0 auto', borderRadius: '50%',
          background: 'var(--sc-bad-bg)', color: 'var(--sc-bad)',
          display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '1.2em',
        }}
      >
        ✕
      </div>
      <div style={{ fontWeight: 800, marginTop: '0.4em' }}>{title}</div>
      <p style={{ fontSize: '0.84em', color: 'var(--sc-muted)', margin: '0.3em 0 0.8em' }}>{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} style={{ minHeight: '2.6em' }}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
