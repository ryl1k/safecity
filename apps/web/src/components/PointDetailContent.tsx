'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AccessibilityFeature, FeatureValue, Profile, PointSummary } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { RatingBadge, ChecklistRow, ReviewItem, Button, LoadingState, ErrorState } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { getCatalog } from '@/lib/catalog';
import { pointById } from '@/lib/points';
import { reviewsFor, type ReviewRow } from '@/lib/reviews';
import { categoryLabel } from '@/lib/format';

const profileLabel: Record<Profile, string> = { wheelchair: 'Крісло колісне', blind: 'Незрячі' };

/** The point detail body (no page shell) — reused by /point/[id] and the map modal. */
export function PointDetailContent({ id }: { id: string }) {
  const { primary } = useProfile();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'notfound'>('loading');
  const [point, setPoint] = useState<PointSummary | null>(null);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [showAll, setShowAll] = useState(false);

  async function load() {
    setStatus('loading');
    try {
      const [cat, p, rv] = await Promise.all([getCatalog(), pointById(id), reviewsFor(id)]);
      if (!p) {
        setStatus('notfound');
        return;
      }
      setCatalog(cat);
      setPoint(p);
      setReviews(rv);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const applicable = useMemo(() => {
    if (!point) return [];
    return catalog
      .filter((f) => f.profile === primary && f.categories.includes(point.category))
      .sort((a, b) => Number(b.critical) - Number(a.critical));
  }, [catalog, point, primary]);

  const reported = useMemo(
    () => (point ? applicable.filter((f) => point.features[f.key] === 'yes' || point.features[f.key] === 'no') : []),
    [applicable, point],
  );
  const shown = showAll ? applicable : reported;
  const hasHidden = applicable.length > reported.length;

  if (status === 'loading') return <LoadingState label="Завантаження місця" />;
  if (status === 'error') return <ErrorState onRetry={() => void load()} />;
  if (status === 'notfound' || !point) return <p style={{ color: 'var(--sc-muted)' }}>Місце не знайдено.</p>;

  return (
    <>
      <h1 style={{ margin: '0 0 0.2em', fontSize: '1.9em', fontWeight: 800, lineHeight: 1.15 }}>{point.name}</h1>
      <p style={{ margin: 0, color: 'var(--sc-muted)' }}>
        {categoryLabel[point.category]}
        {point.address ? ` · ${point.address}` : ''}
      </p>
      {point.description ? <p style={{ margin: '0.8em 0 0', lineHeight: 1.55 }}>{point.description}</p> : null}

      <div style={{ display: 'flex', gap: '1.4em', flexWrap: 'wrap', marginTop: '1.2em' }}>
        {(['wheelchair', 'blind'] as Profile[]).map((pr) => (
          <div key={pr} style={{ display: 'flex', flexDirection: 'column', gap: '0.4em' }}>
            <span style={{ fontSize: '0.78em', fontWeight: 700, color: 'var(--sc-muted)' }}>{profileLabel[pr]}</span>
            <RatingBadge rating={computeRating(point.features, catalog, point.category, pr)} />
          </div>
        ))}
      </div>

      <section style={card}>
        <h2 style={cardTitle}>Чому така оцінка</h2>
        {shown.length === 0 ? (
          <p style={{ color: 'var(--sc-muted)', fontSize: '0.9em', margin: 0 }}>Поки що ніхто не вказав зручності тут — будьте першим.</p>
        ) : (
          shown.map((f, i) => (
            <ChecklistRow
              key={f.key}
              label={f.label}
              value={(point.features[f.key] ?? 'unknown') as FeatureValue}
              critical={f.critical}
              last={i === shown.length - 1}
            />
          ))
        )}
        {hasHidden && (
          <button
            type="button"
            className="sc-foc"
            onClick={() => setShowAll((s) => !s)}
            style={{ marginTop: '0.8em', background: 'none', border: 'none', color: 'var(--sc-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9em' }}
          >
            {showAll ? 'Згорнути' : `Показати всі критерії (${applicable.length})`}
          </button>
        )}
      </section>

      <section style={card}>
        <h2 style={cardTitle}>Відгуки</h2>
        {reviews.length === 0 ? (
          <p style={{ color: 'var(--sc-muted)', fontSize: '0.9em', margin: 0 }}>Ще немає відгуків. Будьте першим.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1em' }}>
            {reviews.map((r) => (
              <ReviewItem key={r.id} author="Користувач" profileTag={profileLabel[r.profile].toLowerCase()} timeAgo={new Date(r.createdAt).toLocaleDateString('uk-UA')} text={r.text ?? ''} />
            ))}
          </div>
        )}
      </section>

      <div style={{ display: 'flex', gap: '0.8em', flexWrap: 'wrap', marginTop: '1.4em' }}>
        <Link href={`/route?to=${point.id}`} className="sc-foc" style={{ textDecoration: 'none' }}>
          <Button>Маршрут сюди</Button>
        </Link>
        <Link href={`/problem/new?point=${point.id}`} className="sc-foc" style={{ textDecoration: 'none' }}>
          <Button variant="danger">Повідомити про проблему</Button>
        </Link>
      </div>
    </>
  );
}

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.2em', marginTop: '1.2em',
} as const;
const cardTitle = { margin: '0 0 0.6em', fontSize: '1.05em', fontWeight: 800 } as const;
