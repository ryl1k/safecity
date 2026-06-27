'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Maximize2, Volume2, Square } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AccessibilityFeature, PointSummary, Rating } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { PointDetailModal } from '@/components/PointDetailModal';
import { SearchBar, Segmented, Chip, ListRow, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { getCatalog } from '@/lib/catalog';
import { pointsNear } from '@/lib/points';
import { categoryLabel, distanceLabel, featureSummary } from '@/lib/format';

const LVIV: [number, number] = [24.0316, 49.8419];
const RADIUS_M = 2500;

const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), { ssr: false });

type Status = 'loading' | 'ready' | 'error';

export default function MapPage() {
  const { primary } = useProfile();
  const [status, setStatus] = useState<Status>('loading');
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [query, setQuery] = useState('');
  const [onlyAccessible, setOnlyAccessible] = useState(false);
  const [modalId, setModalId] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  async function load() {
    setStatus('loading');
    try {
      const [cat, pts] = await Promise.all([getCatalog(), pointsNear(LVIV[0], LVIV[1], RADIUS_M)]);
      setCatalog(cat);
      setPoints(pts);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  const rated = useMemo(
    () => points.map((p) => ({ point: p, rating: computeRating(p.features, catalog, p.category, primary) as Rating })),
    [points, catalog, primary],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rated.filter(({ point, rating }) => {
      if (onlyAccessible && rating !== 'full') return false;
      if (q && !point.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rated, query, onlyAccessible]);

  const markers = useMemo(
    () => filtered.map(({ point, rating }) => ({ id: point.id, name: point.name, lng: point.lng, lat: point.lat, category: point.category, rating })),
    [filtered],
  );

  function speakNearby() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const ratingWord: Record<Rating, string> = { full: 'доступно', partial: 'частково доступно', none: 'недоступно', unknown: 'немає даних' };
    const items = filtered.slice(0, 8).map(({ point, rating }, i) => {
      const summary = featureSummary(point, catalog, primary);
      return `${i + 1}. ${point.name}, ${categoryLabel[point.category]}, ${distanceLabel(point.distanceM)}, ${ratingWord[rating]}${summary ? `, ${summary}` : ''}.`;
    });
    const u = new SpeechSynthesisUtterance(`Поруч ${filtered.length} місць. ${items.join(' ')}`);
    u.lang = 'uk-UA';
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="map" />

      <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto', padding: '1em 1.25em', display: 'flex', flexDirection: 'column', gap: '0.9em' }}>
        <SearchBar value={query} onChange={setQuery} ariaLabel="Пошук місць" placeholder="Пошук місць, транспорту, переходів" />

        <div style={{ display: 'flex', gap: '0.8em', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 1 240px', minWidth: 160 }}>
            <Segmented
              ariaLabel="Режим перегляду"
              value={view}
              onChange={setView}
              options={[{ value: 'map', label: 'Мапа' }, { value: 'list', label: 'Список' }]}
            />
          </div>
          <Chip pressed={onlyAccessible} onToggle={() => setOnlyAccessible((v) => !v)}>
            <span aria-hidden>✓</span> Лише доступні
          </Chip>
          <Link
            href="/explore"
            className="sc-foc"
            aria-label="Повноекранна мапа"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4em', minHeight: '2.5em', padding: '0 0.8em',
              borderRadius: '0.7em', textDecoration: 'none', fontWeight: 700, fontSize: '0.85em',
              border: 'var(--sc-bw) solid var(--sc-border-strong)', background: 'var(--sc-surface)', color: 'var(--sc-text)',
            }}
          >
            <Maximize2 size={15} aria-hidden /> На весь екран
          </Link>
          <span style={{ marginLeft: 'auto', color: 'var(--sc-muted)', fontSize: '0.85em' }} aria-live="polite">
            {status === 'ready' ? `${filtered.length} місць` : ''}
          </span>
        </div>

        {status === 'loading' && <LoadingState />}
        {status === 'error' && <ErrorState onRetry={() => void load()} />}

        {status === 'ready' && filtered.length === 0 && (
          <EmptyState
            title="Нічого не знайдено"
            message="Спробуйте змінити пошук або зніміть фільтр."
            actionLabel="Скинути фільтри"
            onAction={() => {
              setQuery('');
              setOnlyAccessible(false);
            }}
          />
        )}

        {status === 'ready' && filtered.length > 0 && view === 'map' && (
          <div style={{ height: 'calc(100vh - 14rem)', minHeight: 460 }}>
            <MapView points={markers} center={LVIV} onSelect={(id) => setModalId(id)} />
          </div>
        )}

        {status === 'ready' && filtered.length > 0 && view === 'list' && (
          <button
            type="button"
            className="sc-foc"
            onClick={speakNearby}
            aria-label={speaking ? 'Зупинити озвучення' : 'Озвучити місця поруч'}
            style={{
              alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.45em',
              minHeight: '2.5em', padding: '0 0.9em', borderRadius: '0.7em', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9em',
              border: 'var(--sc-bw) solid var(--sc-border-strong)', background: speaking ? 'var(--sc-primary-tint)' : 'var(--sc-surface)', color: speaking ? 'var(--sc-primary)' : 'var(--sc-text)',
            }}
          >
            {speaking ? <Square size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}
            {speaking ? 'Зупинити' : 'Озвучити поруч'}
          </button>
        )}

        {status === 'ready' && filtered.length > 0 && view === 'list' && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', overflow: 'hidden' }}>
            {filtered.map(({ point, rating }, i) => {
              const summary = featureSummary(point, catalog, primary);
              const meta = [categoryLabel[point.category], distanceLabel(point.distanceM), summary || 'немає даних'].join(' · ');
              return (
                <li key={point.id} style={{ borderTop: i ? 'var(--sc-bw) solid var(--sc-border)' : 'none' }}>
                  <ListRow name={point.name} rating={rating} meta={meta} onClick={() => setModalId(point.id)} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Footer />

      {modalId && <PointDetailModal id={modalId} onClose={() => setModalId(null)} />}
    </div>
  );
}
