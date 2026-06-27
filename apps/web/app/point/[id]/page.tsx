'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AccessibilityFeature, FeatureValue, Profile, PointSummary } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { RatingBadge, ChecklistRow, ReviewItem, Button, LoadingState, ErrorState } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { getCatalog } from '@/lib/catalog';
import { pointById } from '@/lib/points';
import { reviewsFor, type ReviewRow } from '@/lib/reviews';
import { categoryLabel } from '@/lib/format';

const profileLabel: Record<Profile, string> = { wheelchair: 'Крісло колісне', blind: 'Незрячі' };

export default function PointDetailPage({ params }: { params: { id: string } }) {
  const { primary } = useProfile();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'notfound'>('loading');
  const [point, setPoint] = useState<PointSummary | null>(null);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [showAll, setShowAll] = useState(false);

  async function load() {
    setStatus('loading');
    try {
      const [cat, p, rv] = await Promise.all([getCatalog(), pointById(params.id), reviewsFor(params.id)]);
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
  }, [params.id]);

  // Applicable features for the active profile, critical first.
  const applicable = useMemo(() => {
    if (!point) return [];
    return catalog
      .filter((f) => f.profile === primary && f.categories.includes(point.category))
      .sort((a, b) => Number(b.critical) - Number(a.critical));
  }, [catalog, point, primary]);

  // Default: only what people actually reported (yes/no). The rest hides behind a toggle.
  const reported = useMemo(
    () => (point ? applicable.filter((f) => point.features[f.key] === 'yes' || point.features[f.key] === 'no') : []),
    [applicable, point],
  );
  const shown = showAll ? applicable : reported;
  const hasHidden = applicable.length > reported.length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="map" />
      <main style={{ flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: '1.4em 1.25em 4em' }}>
        <Link href="/map" className="sc-foc" style={{ color: 'var(--sc-primary)', fontWeight: 700, textDecoration: 'none', fontSize: '0.9em' }}>
          ‹ До мапи
        </Link>

        {status === 'loading' && <div style={{ marginTop: '1em' }}><LoadingState label="Завантаження місця" /></div>}
        {status === 'error' && <div style={{ marginTop: '1em' }}><ErrorState onRetry={() => void load()} /></div>}
        {status === 'notfound' && <p style={{ marginTop: '1.5em', color: 'var(--sc-muted)' }}>Місце не знайдено.</p>}

        {status === 'ready' && point && (
          <>
            <h1 style={{ margin: '0.6em 0 0.2em', fontSize: '1.9em', fontWeight: 800, lineHeight: 1.15 }}>{point.name}</h1>
            <p style={{ margin: 0, color: 'var(--sc-muted)' }}>
              {categoryLabel[point.category]}
              {point.address ? ` · ${point.address}` : ''}
            </p>

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
                <p style={{ color: 'var(--sc-muted)', fontSize: '0.9em', margin: 0 }}>
                  Поки що ніхто не вказав зручності тут — будьте першим.
                </p>
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
                    <ReviewItem
                      key={r.id}
                      author="Користувач"
                      profileTag={profileLabel[r.profile].toLowerCase()}
                      timeAgo={new Date(r.createdAt).toLocaleDateString('uk-UA')}
                      text={r.text ?? ''}
                    />
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
        )}
      </main>
      <Footer />
    </div>
  );
}

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.2em', marginTop: '1.2em',
} as const;
const cardTitle = { margin: '0 0 0.6em', fontSize: '1.05em', fontWeight: 800 } as const;
