'use client';

import Link from 'next/link';
import { categoryLabel } from '@/lib/format';
import { useBusiness } from '@/lib/businessContext';
import type { MyPoint } from '@/lib/business';

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.2em 1.3em',
} as const;

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{ ...card, padding: '1em 1.2em' }}>
      <div style={{ fontSize: '0.78em', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--sc-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.7em', fontWeight: 800, marginTop: '0.15em', color: accent ? 'var(--sc-primary)' : 'var(--sc-text)' }}>{value}</div>
    </div>
  );
}

function Metric({ icon, value, title }: { icon: string; value: string | number; title: string }) {
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3em', fontSize: '0.85em', fontWeight: 700, color: 'var(--sc-muted)' }}>
      <span aria-hidden>{icon}</span>{value}
    </span>
  );
}

export default function BusinessAnalytics() {
  const { me } = useBusiness();
  const pts = me.points;
  const totalViews = pts.reduce((s, p) => s + p.viewCount, 0);
  const totalSearch = pts.reduce((s, p) => s + p.searchAppearances, 0);
  const totalReviews = pts.reduce((s, p) => s + p.reviewCount, 0);
  const weightedStars = pts.reduce((s, p) => s + (p.avgRating ?? 0) * p.reviewCount, 0);
  const avgRating = totalReviews ? weightedStars / totalReviews : null;
  const maxViews = Math.max(1, ...pts.map((p) => p.viewCount));
  const ranked = [...pts].sort((a, b) => b.viewCount - a.viewCount);

  const catOf = (p: MyPoint) => categoryLabel[p.category as keyof typeof categoryLabel] ?? p.category;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2em' }}>
      <h1 style={{ margin: 0, fontSize: '1.6em', fontWeight: 800 }}>Аналітика</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.9em' }}>
        <StatCard label="Перегляди" value={totalViews} accent />
        <StatCard label="Появи в пошуку" value={totalSearch} accent />
        <StatCard label="Відгуки" value={totalReviews} />
        <StatCard label="Середня оцінка" value={avgRating != null ? `★ ${avgRating.toFixed(1)}` : '—'} />
      </div>

      {/* Per-point breakdown */}
      <section style={{ ...card, padding: '0.4em 0' }}>
        <div style={{ padding: '0.9em 1.3em 0.7em', fontWeight: 800 }}>За точками</div>
        {pts.length === 0 ? (
          <p style={{ margin: 0, padding: '0 1.3em 1em', color: 'var(--sc-muted)' }}>Немає точок для аналізу.</p>
        ) : (
          ranked.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8em', flexWrap: 'wrap',
                padding: '0.8em 1.3em', borderTop: 'var(--sc-bw) solid var(--sc-border)',
              }}
            >
              <Link href={`/point/${p.id}`} style={{ minWidth: 0, flex: '1 1 180px', textDecoration: 'none', color: 'var(--sc-text)' }}>
                <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ color: 'var(--sc-muted)', fontSize: '0.8em' }}>{catOf(p)}</div>
              </Link>
              <div style={{ display: 'flex', gap: '1em', flexWrap: 'wrap' }}>
                <Metric icon="👁" value={p.viewCount} title="Перегляди" />
                <Metric icon="🔎" value={p.searchAppearances} title="Появи в пошуку" />
                <Metric icon="💬" value={p.reviewCount} title="Відгуки" />
                <Metric icon="★" value={p.avgRating != null ? p.avgRating.toFixed(1) : '—'} title="Середня оцінка" />
              </div>
            </div>
          ))
        )}
      </section>

      {/* Views chart */}
      {totalViews > 0 && (
        <section style={card}>
          <div style={{ fontWeight: 800, marginBottom: '0.9em' }}>Перегляди за точками</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7em' }}>
            {ranked.filter((p) => p.viewCount > 0).map((p) => (
              <div key={p.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6em', fontSize: '0.86em', marginBottom: '0.25em' }}>
                  <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ color: 'var(--sc-primary)', fontWeight: 800, flexShrink: 0 }}>{p.viewCount}</span>
                </div>
                <div style={{ height: '0.5em', borderRadius: '1em', background: 'var(--sc-surface-2)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(3, (p.viewCount / maxViews) * 100)}%`, height: '100%', background: 'var(--sc-primary)', borderRadius: '1em' }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p style={{ margin: 0, fontSize: '0.78em', color: 'var(--sc-muted)' }}>
        Перегляд рахується при відкритті сторінки точки; поява в пошуку — коли точка потрапляє у результати пошуку.
      </p>
    </div>
  );
}
