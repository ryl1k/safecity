'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AccessibilityFeature, FeatureValue, Profile, PointSummary } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { RatingBadge, ChecklistRow, ReviewItem, Button, LoadingState, ErrorState } from '@/components/ui';
import { PhotoInput } from '@/components/PhotoInput';
import { PhotoGallery } from '@/components/PhotoGallery';
import { useProfile } from '@/profile/ProfileProvider';
import { getCatalog } from '@/lib/catalog';
import { pointById } from '@/lib/points';
import { reviewsFor, addReview, type ReviewRow } from '@/lib/reviews';
import { uploadPhotos } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { categoryLabel } from '@/lib/format';

const profileLabel: Record<Profile, string> = { wheelchair: 'Крісло колісне', blind: 'Незрячі' };

/** The point detail body (no page shell) — reused by /point/[id] and the map modal. */
export function PointDetailContent({ id, onRouteClick }: { id: string; onRouteClick?: () => void }) {
  const { primary, needs } = useProfile();
  // Show ratings only for the user's needs; a guest who never onboarded sees both.
  const shownProfiles: Profile[] = needs.length ? needs : ['wheelchair', 'blind'];
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'notfound'>('loading');
  const [point, setPoint] = useState<PointSummary | null>(null);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  // Review form
  const [formOpen, setFormOpen] = useState(false);
  const [stars, setStars] = useState(5);
  const [text, setText] = useState('');
  const [reviewPhotos, setReviewPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

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

  async function openForm() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      router.push(`/auth?next=/point/${id}`);
      return;
    }
    setFormOpen(true);
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    setReviewError(null);
    setBusy(true);
    try {
      const urls = await uploadPhotos(reviewPhotos, 'reviews');
      await addReview(id, primary, stars, text, urls);
      setReviews(await reviewsFor(id));
      setFormOpen(false);
      setText('');
      setStars(5);
      setReviewPhotos([]);
    } catch (err: any) {
      if (err?.message === 'not-authenticated') router.push(`/auth?next=/point/${id}`);
      else setReviewError(err?.message ?? 'Не вдалося опублікувати');
    } finally {
      setBusy(false);
    }
  }

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
      {/* Photos + description first — discovery before accessibility detail */}
      {point.photos && point.photos.length > 0 ? (
        <div style={{ marginTop: '1em' }}><PhotoGallery photos={point.photos} alt={point.name} /></div>
      ) : null}
      {point.description ? <p style={{ margin: '0.9em 0 0', lineHeight: 1.55 }}>{point.description}</p> : null}

      {/* Actions up top */}
      <div style={{ display: 'flex', gap: '0.8em', flexWrap: 'wrap', marginTop: '1.2em' }}>
        {onRouteClick ? (
          <button type="button" className="sc-foc" onClick={onRouteClick} style={actionLink('primary')}>Маршрут сюди</button>
        ) : (
          <Link href={`/route?to=${point.id}`} className="sc-foc" style={actionLink('primary')}>Маршрут сюди</Link>
        )}
        <Link href={`/problem/new?point=${point.id}`} className="sc-foc" style={actionLink('danger')}>Повідомити про проблему</Link>
      </div>

      {/* Accessibility — secondary, collapsed. No prominent grey badge. */}
      <section style={card}>
        <button
          type="button"
          className="sc-foc"
          aria-expanded={accessOpen}
          onClick={() => setAccessOpen((o) => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.6em', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: 0 }}
        >
          <h2 style={{ ...cardTitle, margin: 0 }}>Доступність</h2>
          <span style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap' }}>
            {shownProfiles.map((pr) => {
              const r = computeRating(point.features, catalog, point.category, pr);
              return r === 'unknown' ? null : <RatingBadge key={pr} rating={r} />;
            })}
          </span>
          <span aria-hidden style={{ marginLeft: 'auto', color: 'var(--sc-muted)', fontSize: '1.1em' }}>{accessOpen ? '▾' : '▸'}</span>
        </button>
        {accessOpen && (
          <div style={{ marginTop: '0.8em' }}>
            {shown.length === 0 ? (
              <p style={{ color: 'var(--sc-muted)', fontSize: '0.9em', margin: 0 }}>Поки що ніхто не вказав зручності тут — будьте першим.</p>
            ) : (
              shown.map((f, i) => (
                <ChecklistRow key={f.key} label={f.label} value={(point.features[f.key] ?? 'unknown') as FeatureValue} critical={f.critical} last={i === shown.length - 1} />
              ))
            )}
            {hasHidden && (
              <button type="button" className="sc-foc" onClick={() => setShowAll((s) => !s)} style={{ marginTop: '0.8em', background: 'none', border: 'none', color: 'var(--sc-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9em' }}>
                {showAll ? 'Згорнути' : `Показати всі критерії (${applicable.length})`}
              </button>
            )}
          </div>
        )}
      </section>

      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6em', marginBottom: '0.6em', flexWrap: 'wrap' }}>
          <h2 style={{ ...cardTitle, margin: 0 }}>Відгуки</h2>
          {!formOpen && <Button variant="secondary" onClick={openForm} style={{ minHeight: '2.4em' }}>Написати відгук</Button>}
        </div>

        {formOpen && (
          <form onSubmit={submitReview} style={{ display: 'flex', flexDirection: 'column', gap: '0.7em', marginBottom: '1em', padding: '1em', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.8em' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3em' }} role="radiogroup" aria-label="Оцінка">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className="sc-foc" role="radio" aria-checked={stars === n} aria-label={`${n} з 5`} onClick={() => setStars(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5em', lineHeight: 1, color: n <= stars ? 'var(--sc-warn)' : 'var(--sc-border-strong)' }}>
                  ★
                </button>
              ))}
            </div>
            <textarea
              className="sc-foc"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Поділіться досвідом доступності цього місця"
              rows={3}
              style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: '0.7em 0.9em', borderRadius: '0.7em', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'inherit', fontSize: '1em', border: 'var(--sc-bw) solid var(--sc-border-strong)', resize: 'vertical' }}
            />
            <PhotoInput files={reviewPhotos} onChange={setReviewPhotos} />
            {reviewError ? <div role="alert" style={{ color: 'var(--sc-bad)', fontWeight: 700, fontSize: '0.85em' }}>{reviewError}</div> : null}
            <div style={{ display: 'flex', gap: '0.6em', flexWrap: 'wrap' }}>
              <Button type="submit" disabled={busy}>{busy ? 'Публікація…' : 'Опублікувати'}</Button>
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Скасувати</Button>
            </div>
          </form>
        )}

        {reviews.length === 0 ? (
          <p style={{ color: 'var(--sc-muted)', fontSize: '0.9em', margin: 0 }}>Ще немає відгуків. Будьте першим.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1em' }}>
            {reviews.map((r) => (
              <div key={r.id}>
                <ReviewItem author="Користувач" profileTag={profileLabel[r.profile].toLowerCase()} timeAgo={new Date(r.createdAt).toLocaleDateString('uk-UA')} text={r.text ?? ''} />
                {r.photos.length > 0 ? (
                  <div style={{ marginTop: '0.5em', marginLeft: '3.1em' }}><PhotoGallery photos={r.photos} alt="Фото відгуку" /></div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.2em', marginTop: '1.2em',
} as const;
const cardTitle = { margin: '0 0 0.6em', fontSize: '1.05em', fontWeight: 800 } as const;

// Button-styled navigation links (a real <a>, so screen readers announce one control).
function actionLink(kind: 'primary' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-grid', placeItems: 'center', minHeight: '2.9em', padding: '0 1.2em',
    borderRadius: '0.7em', fontWeight: 800, textDecoration: 'none', fontFamily: 'inherit',
    maxWidth: '100%', boxSizing: 'border-box', whiteSpace: 'normal', textAlign: 'center',
  };
  return kind === 'primary'
    ? { ...base, background: 'var(--sc-primary)', color: 'var(--sc-on-primary)' }
    : { ...base, background: 'var(--sc-surface)', color: 'var(--sc-bad)', border: 'var(--sc-bw) solid var(--sc-bad)' };
}
