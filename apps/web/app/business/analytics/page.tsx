'use client';

import Link from 'next/link';
import { categoryLabel } from '@/lib/format';
import { useBusiness } from '@/lib/businessContext';

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.2em 1.3em',
} as const;

export default function BusinessAnalytics() {
  const { me } = useBusiness();
  const ranked = [...me.points].sort((a, b) => b.viewCount - a.viewCount);
  const totalViews = ranked.reduce((s, p) => s + p.viewCount, 0);
  const maxViews = Math.max(1, ...ranked.map((p) => p.viewCount));
  const avg = ranked.length ? Math.round(totalViews / ranked.length) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2em' }}>
      <h1 style={{ margin: 0, fontSize: '1.6em', fontWeight: 800 }}>Аналітика</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.9em' }}>
        <div style={{ ...card, padding: '1em 1.2em' }}>
          <div style={{ fontSize: '0.78em', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--sc-muted)' }}>Усього переглядів</div>
          <div style={{ fontSize: '1.7em', fontWeight: 800, marginTop: '0.15em', color: 'var(--sc-primary)' }}>{totalViews}</div>
        </div>
        <div style={{ ...card, padding: '1em 1.2em' }}>
          <div style={{ fontSize: '0.78em', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--sc-muted)' }}>У середньому на точку</div>
          <div style={{ fontSize: '1.7em', fontWeight: 800, marginTop: '0.15em' }}>{avg}</div>
        </div>
        <div style={{ ...card, padding: '1em 1.2em' }}>
          <div style={{ fontSize: '0.78em', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--sc-muted)' }}>Точок</div>
          <div style={{ fontSize: '1.7em', fontWeight: 800, marginTop: '0.15em' }}>{ranked.length}</div>
        </div>
      </div>

      <section style={card}>
        <div style={{ fontWeight: 800, marginBottom: '0.9em' }}>Перегляди за точками</div>
        {ranked.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--sc-muted)' }}>Немає точок для аналізу.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85em' }}>
            {ranked.map((p) => (
              <div key={p.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6em', fontSize: '0.88em', marginBottom: '0.3em' }}>
                  <Link href={`/point/${p.id}`} style={{ textDecoration: 'none', color: 'var(--sc-text)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                    <span style={{ color: 'var(--sc-muted)', fontWeight: 500 }}> · {categoryLabel[p.category as keyof typeof categoryLabel] ?? p.category}</span>
                  </Link>
                  <span style={{ color: 'var(--sc-primary)', fontWeight: 800, flexShrink: 0 }}>{p.viewCount}</span>
                </div>
                <div style={{ height: '0.55em', borderRadius: '1em', background: 'var(--sc-surface-2)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(3, (p.viewCount / maxViews) * 100)}%`, height: '100%', background: 'var(--sc-primary)', borderRadius: '1em' }} />
                </div>
              </div>
            ))}
          </div>
        )}
        <p style={{ margin: '1em 0 0', fontSize: '0.78em', color: 'var(--sc-muted)' }}>
          Перегляд рахується щоразу, коли хтось відкриває сторінку точки.
        </p>
      </section>
    </div>
  );
}
