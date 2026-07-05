'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, Search, MessageSquare, Star, type LucideIcon } from 'lucide-react';
import type { AccessibilityFeature, AccessLevel, PointSummary } from '@safecity/shared';
import { accessLevel } from '@safecity/shared';
import { categoryLabel } from '@/lib/format';
import { levelLabel, levelColor } from '@/lib/filters';
import { getCatalog } from '@/lib/catalog';
import { pointById, pointsNear } from '@/lib/points';
import { useBusiness } from '@/lib/businessContext';
import { businessAnalytics, type BusinessAnalyticsData, type MyPoint } from '@/lib/business';

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.2em 1.3em',
} as const;

const LEVELS: AccessLevel[] = ['high', 'medium', 'low'];
const levelRank: Record<AccessLevel, number> = { high: 3, medium: 2, low: 1, unknown: 0 };

type Range = '1d' | '1w' | '1m' | '1y';
const RANGES: { key: Range; label: string }[] = [
  { key: '1d', label: '1 день' },
  { key: '1w', label: '1 тиждень' },
  { key: '1m', label: '1 місяць' },
  { key: '1y', label: '1 рік' },
];

// Fixed bins for each range (label + start timestamp), oldest → newest.
function buildBins(range: Range): { start: number; label: string }[] {
  const now = new Date();
  const bins: { start: number; label: string }[] = [];
  const day = 86400000;
  if (range === '1d') {
    const base = new Date(now); base.setMinutes(0, 0, 0);
    for (let i = 23; i >= 0; i--) { const d = new Date(base.getTime() - i * 3600000); bins.push({ start: d.getTime(), label: `${d.getHours()}` }); }
  } else if (range === '1w') {
    const base = new Date(now); base.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) { const d = new Date(base.getTime() - i * day); bins.push({ start: d.getTime(), label: d.toLocaleDateString('uk-UA', { weekday: 'short' }) }); }
  } else if (range === '1m') {
    const base = new Date(now); base.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) { const d = new Date(base.getTime() - i * day); bins.push({ start: d.getTime(), label: `${d.getDate()}` }); }
  } else {
    const base = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = 11; i >= 0; i--) { const d = new Date(base.getFullYear(), base.getMonth() - i, 1); bins.push({ start: d.getTime(), label: d.toLocaleDateString('uk-UA', { month: 'short' }) }); }
  }
  return bins;
}

// Count timestamps into bins (a value falls in the last bin whose start <= it).
function countIntoBins(times: number[], starts: number[]): number[] {
  const counts = new Array(starts.length).fill(0);
  for (const t of times) {
    if (starts.length === 0 || t < starts[0]!) continue;
    let idx = 0;
    for (let i = 0; i < starts.length; i++) { if (starts[i]! <= t) idx = i; else break; }
    counts[idx]++;
  }
  return counts;
}

// Simple CSS bar chart. Values align 1:1 with labels.
// Responsive multi-series area/line graph. Strokes stay crisp (non-scaling) while
// the x-axis stretches to fill the container; labels render as HTML below.
function LineChart({ labels, series, height = 150 }: { labels: string[]; series: { name: string; color: string; values: number[] }[]; height?: number }) {
  const n = labels.length;
  const W = 1000;
  const padTop = 10;
  const padBottom = 8;
  const innerH = height - padTop - padBottom;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => padTop + innerH - (v / max) * innerH;
  const base = padTop + innerH;
  return (
    <div style={{ marginTop: '0.4em' }}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label="Графік за часом" style={{ display: 'block' }}>
        <line x1={0} y1={base} x2={W} y2={base} stroke="var(--sc-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {series.map((s) => {
          const line = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
          const area = `M0,${base} ` + s.values.map((v, i) => `L${x(i)},${y(v)}`).join(' ') + ` L${W},${base} Z`;
          return (
            <g key={s.name}>
              <path d={area} fill={s.color} opacity={0.12} />
              <polyline className="sc-draw" points={line} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1} strokeDasharray={1} strokeDashoffset={1} />
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', marginTop: '0.3em' }}>
        {labels.map((l, i) => (
          <span key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: '0.62em', color: 'var(--sc-muted)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ ...card, padding: '1em 1.2em' }}>
      <div style={{ fontSize: '0.78em', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--sc-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.7em', fontWeight: 800, marginTop: '0.15em', color: accent ? 'var(--sc-primary)' : 'var(--sc-text)' }}>{value}</div>
    </div>
  );
}

function Metric({ icon: Icon, value, title, fill }: { icon: LucideIcon; value: string | number; title: string; fill?: boolean }) {
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em', fontSize: '0.85em', fontWeight: 700, color: 'var(--sc-muted)' }}>
      <Icon size={15} aria-hidden fill={fill ? 'currentColor' : 'none'} />{value}
    </span>
  );
}

export default function BusinessAnalytics() {
  const { me } = useBusiness();
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [data, setData] = useState<BusinessAnalyticsData | null>(null);
  const [range, setRange] = useState<Range>('1m');
  const [selId, setSelId] = useState<string | null>(me.points[0]?.id ?? null);
  const [nearby, setNearby] = useState<{ own: AccessLevel; others: AccessLevel[] } | null>(null);

  useEffect(() => { void getCatalog().then(setCatalog).catch(() => {}); }, []);
  useEffect(() => { void businessAnalytics().then(setData).catch(() => {}); }, []);

  // Nearby accessibility comparison for the selected point (accessibility only —
  // no view/search data). Recomputes when the selection or catalog changes.
  useEffect(() => {
    if (!selId || catalog.length === 0) { setNearby(null); return; }
    let alive = true;
    (async () => {
      const self = await pointById(selId).catch(() => null);
      if (!self || !alive) return;
      const near: PointSummary[] = await pointsNear(self.lng, self.lat, 1500).catch(() => []);
      if (!alive) return;
      const own = accessLevel(self.features, catalog, self.category);
      const others = near.filter((n) => n.id !== selId).map((n) => accessLevel(n.features, catalog, n.category));
      setNearby({ own, others });
    })();
    return () => { alive = false; };
  }, [selId, catalog]);

  const pts = me.points;
  const totalViews = pts.reduce((s, p) => s + p.viewCount, 0);
  const totalSearch = pts.reduce((s, p) => s + p.searchAppearances, 0);
  const totalReviews = pts.reduce((s, p) => s + p.reviewCount, 0);
  const weightedStars = pts.reduce((s, p) => s + (p.avgRating ?? 0) * p.reviewCount, 0);
  const avgRating = totalReviews ? weightedStars / totalReviews : null;
  const maxViews = Math.max(1, ...pts.map((p) => p.viewCount));
  const ranked = [...pts].sort((a, b) => b.viewCount - a.viewCount);

  const levelOfPoint = (p: MyPoint): AccessLevel | null =>
    catalog.length ? accessLevel(p.features, catalog, p.category) : null;
  const levelCounts = pts.reduce(
    (acc, p) => { const l = levelOfPoint(p); if (l) acc[l] = (acc[l] ?? 0) + 1; return acc; },
    {} as Record<AccessLevel, number>,
  );
  const catOf = (p: MyPoint) => categoryLabel[p.category as keyof typeof categoryLabel] ?? p.category;

  // Reviews-over-time bins for the selected range.
  const reviewBins = useMemo(() => {
    const bins = buildBins(range);
    const times = (data?.reviews ?? []).map((r) => new Date(r.createdAt).getTime());
    const counts = countIntoBins(times, bins.map((b) => b.start));
    return bins.map((b, i) => ({ label: b.label, value: counts[i]! }));
  }, [data, range]);
  const reviewsInRange = reviewBins.reduce((s, b) => s + b.value, 0);

  // View/search daily NEW counts, derived from forward-only cumulative snapshots.
  const metricBins = useMemo(() => {
    const m = data?.metrics ?? [];
    return m.map((d, i) => {
      const prev = i > 0 ? m[i - 1]! : null;
      const dv = prev ? Math.max(0, d.viewCount - prev.viewCount) : 0;
      const ds = prev ? Math.max(0, d.searchAppearances - prev.searchAppearances) : 0;
      const label = d.day.slice(5); // MM-DD
      return { day: d.day, label, views: i === 0 ? 0 : dv, search: i === 0 ? 0 : ds };
    });
  }, [data]);
  const metricsSince = data?.metrics[0]?.day ?? null;
  const hasMetricDeltas = metricBins.some((b) => b.views > 0 || b.search > 0);

  return (
    <div className="sc-stagger" style={{ display: 'flex', flexDirection: 'column', gap: '1.2em' }}>
      <h1 style={{ margin: 0, fontSize: '1.6em', fontWeight: 800 }}>Аналітика</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.9em' }}>
        <StatCard label="Перегляди" value={totalViews} accent />
        <StatCard label="Появи в пошуку" value={totalSearch} accent />
        <StatCard label="Відгуки" value={totalReviews} />
        <StatCard
          label="Середня оцінка"
          value={avgRating != null
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25em' }}><Star size={22} fill="currentColor" aria-hidden />{avgRating.toFixed(1)}</span>
            : '—'}
        />
      </div>

      {/* Reviews over time — real timestamps, range-selectable */}
      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6em', marginBottom: '0.4em' }}>
          <div style={{ fontWeight: 800 }}>Відгуки за часом</div>
          <div style={{ display: 'flex', gap: '0.3em', flexWrap: 'wrap' }}>
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                className="sc-foc"
                aria-pressed={range === r.key}
                onClick={() => setRange(r.key)}
                style={{
                  minHeight: '2em', padding: '0 0.7em', borderRadius: '2em', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.78em',
                  border: `var(--sc-bw) solid ${range === r.key ? 'var(--sc-primary)' : 'var(--sc-border-strong)'}`,
                  background: range === r.key ? 'var(--sc-primary)' : 'var(--sc-surface)',
                  color: range === r.key ? 'var(--sc-on-primary)' : 'var(--sc-text)',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {reviewsInRange === 0 ? (
          <p style={{ margin: '0.4em 0 0', color: 'var(--sc-muted)', fontSize: '0.88em' }}>За обраний період відгуків немає.</p>
        ) : (
          <LineChart labels={reviewBins.map((b) => b.label)} series={[{ name: 'reviews', color: 'var(--sc-primary)', values: reviewBins.map((b) => b.value) }]} />
        )}
      </section>

      {/* View/search trend — forward-only snapshots */}
      <section style={card}>
        <div style={{ fontWeight: 800, marginBottom: '0.2em' }}>Нові перегляди та пошуки за днями</div>
        {!hasMetricDeltas ? (
          <p style={{ margin: '0.3em 0 0', color: 'var(--sc-muted)', fontSize: '0.85em' }}>
            Динаміка з’явиться за кілька днів — щоденні знімки почали накопичуватися{metricsSince ? ` з ${metricsSince}` : ''}.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '1em', fontSize: '0.75em', color: 'var(--sc-muted)', marginBottom: '0.2em' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}><span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--sc-primary)' }} /> Перегляди</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}><span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--sc-accent)' }} /> Пошук</span>
            </div>
            <LineChart
              labels={metricBins.map((b) => b.label)}
              series={[
                { name: 'views', color: 'var(--sc-primary)', values: metricBins.map((b) => b.views) },
                { name: 'search', color: 'var(--sc-accent)', values: metricBins.map((b) => b.search) },
              ]}
            />
            <p style={{ margin: '0.5em 0 0', fontSize: '0.72em', color: 'var(--sc-muted)' }}>
              Історія переглядів/пошуку ведеться лише з {metricsSince} — раніші дані не зберігалися.
            </p>
          </>
        )}
      </section>

      {/* Accessibility level breakdown across the caller's points */}
      {catalog.length > 0 && pts.length > 0 && (
        <section style={{ ...card }}>
          <div style={{ fontWeight: 800, marginBottom: '0.7em' }}>Рівень доступності ваших точок</div>
          <div style={{ display: 'flex', gap: '0.6em', flexWrap: 'wrap' }}>
            {LEVELS.map((l) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '0.5em', padding: '0.5em 0.9em', borderRadius: '0.7em', border: `var(--sc-bw) solid ${levelColor[l]}` }}>
                <span aria-hidden style={{ width: '0.7em', height: '0.7em', borderRadius: '50%', background: levelColor[l] }} />
                <span style={{ fontWeight: 700, color: levelColor[l] }}>{levelLabel[l]}</span>
                <span style={{ fontWeight: 800, fontSize: '1.1em' }}>{levelCounts[l] ?? 0}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Nearby accessibility comparison (accessibility only, no views) */}
      {pts.length > 0 && (
        <section style={card}>
          <div style={{ fontWeight: 800, marginBottom: '0.2em' }}>Порівняння доступності поблизу</div>
          <p style={{ margin: '0 0 0.7em', color: 'var(--sc-muted)', fontSize: '0.83em' }}>Наскільки доступна ваша точка порівняно із закладами у радіусі 1,5 км.</p>
          {pts.length > 1 && (
            <div style={{ display: 'flex', gap: '0.4em', flexWrap: 'wrap', marginBottom: '0.8em' }}>
              {pts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="sc-foc"
                  aria-pressed={selId === p.id}
                  onClick={() => setSelId(p.id)}
                  style={{
                    minHeight: '2.1em', padding: '0 0.8em', borderRadius: '2em', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8em', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    border: `var(--sc-bw) solid ${selId === p.id ? 'var(--sc-primary)' : 'var(--sc-border-strong)'}`,
                    background: selId === p.id ? 'var(--sc-primary)' : 'var(--sc-surface)',
                    color: selId === p.id ? 'var(--sc-on-primary)' : 'var(--sc-text)',
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {!nearby ? (
            <p style={{ margin: 0, color: 'var(--sc-muted)', fontSize: '0.88em' }}>Завантаження…</p>
          ) : nearby.others.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--sc-muted)', fontSize: '0.88em' }}>Поблизу немає інших точок для порівняння.</p>
          ) : (
            (() => {
              const total = nearby.others.length;
              const worse = nearby.others.filter((l) => levelRank[l] < levelRank[nearby.own]).length;
              const pct = Math.round((worse / total) * 100);
              const dist = LEVELS.map((l) => ({ l, n: nearby.others.filter((x) => x === l).length }));
              const unknownN = nearby.others.filter((x) => x === 'unknown').length;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8em' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6em', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: levelColor[nearby.own] }}>Ваша точка: {levelLabel[nearby.own]}</span>
                    <span style={{ color: 'var(--sc-muted)', fontSize: '0.9em' }}>
                      доступніша за <strong style={{ color: 'var(--sc-text)' }}>{worse}</strong> із {total} закладів поблизу ({pct}%)
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.6em', flexWrap: 'wrap' }}>
                    {dist.map(({ l, n }) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '0.45em', padding: '0.4em 0.8em', borderRadius: '0.7em', border: `var(--sc-bw) solid ${levelColor[l]}` }}>
                        <span aria-hidden style={{ width: '0.6em', height: '0.6em', borderRadius: '50%', background: levelColor[l] }} />
                        <span style={{ fontWeight: 700, color: levelColor[l], fontSize: '0.85em' }}>{levelLabel[l]}</span>
                        <span style={{ fontWeight: 800 }}>{n}</span>
                      </div>
                    ))}
                    {unknownN > 0 && <span style={{ color: 'var(--sc-muted)', fontSize: '0.8em', alignSelf: 'center' }}>+{unknownN} без даних</span>}
                  </div>
                </div>
              );
            })()
          )}
        </section>
      )}

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
                <div style={{ color: 'var(--sc-muted)', fontSize: '0.8em', display: 'flex', alignItems: 'center', gap: '0.4em' }}>
                  {(() => { const l = levelOfPoint(p); return l ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3em', color: levelColor[l], fontWeight: 700 }}><span aria-hidden style={{ width: '0.5em', height: '0.5em', borderRadius: '50%', background: levelColor[l] }} />{levelLabel[l]}</span> : null; })()}
                  <span>{catOf(p)}</span>
                </div>
              </Link>
              <div style={{ display: 'flex', gap: '1em', flexWrap: 'wrap' }}>
                <Metric icon={Eye} value={p.viewCount} title="Перегляди" />
                <Metric icon={Search} value={p.searchAppearances} title="Появи в пошуку" />
                <Metric icon={MessageSquare} value={p.reviewCount} title="Відгуки" />
                <Metric icon={Star} value={p.avgRating != null ? p.avgRating.toFixed(1) : '—'} title="Середня оцінка" fill={p.avgRating != null} />
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
