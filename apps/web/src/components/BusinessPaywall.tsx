'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Shown in place of a premium dashboard page when the caller is on the free
 * tier. A faint blurred skeleton hints at the content behind a lock card that
 * routes to the (always-open) subscription page.
 */
export function BusinessPaywall({ title = 'Матеріали для бізнесу' }: { title?: string }) {
  return (
    <div style={{ position: 'relative', minHeight: 420 }}>
      {/* Decorative blurred teaser — no real data, purely visual. */}
      <div aria-hidden style={{ filter: 'blur(7px)', opacity: 0.5, pointerEvents: 'none', userSelect: 'none', display: 'flex', flexDirection: 'column', gap: '0.9em' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.9em' }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ height: 74, borderRadius: '1em', background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)' }} />
          ))}
        </div>
        <div style={{ height: 160, borderRadius: '1em', background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)' }} />
        <div style={{ height: 120, borderRadius: '1em', background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)' }} />
      </div>

      <div
        style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '1em',
        }}
      >
        <section
          style={{
            maxWidth: 440, textAlign: 'center', background: 'var(--sc-surface)',
            border: '2px solid var(--sc-primary)', borderRadius: '1.1em', padding: '1.6em 1.5em',
            boxShadow: '0 12px 40px rgba(0,0,0,0.16)',
          }}
        >
          <span aria-hidden style={{ display: 'inline-grid', placeItems: 'center', width: '3em', height: '3em', borderRadius: '50%', background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)', marginBottom: '0.6em' }}>
            <Lock size={24} />
          </span>
          <h2 style={{ margin: '0 0 0.4em', fontSize: '1.25em', fontWeight: 800 }}>{title}</h2>
          <p style={{ margin: '0 0 1.2em', color: 'var(--sc-muted)', fontSize: '0.92em', lineHeight: 1.5 }}>
            Це розділ для бізнес-акаунтів. Оформіть бізнес-підписку, щоб розблокувати аналітику, порівняння доступності та інструменти верифікації.
          </p>
          <Link href="/business/subscription" style={{ textDecoration: 'none' }}>
            <Button>Оформити підписку</Button>
          </Link>
        </section>
      </div>
    </div>
  );
}
