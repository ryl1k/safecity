'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Volume2, Square } from 'lucide-react';
import type { AccessibilityFeature, Category, PointSummary, Rating } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { SearchBar, Chip, ListRow, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { getCatalog } from '@/lib/catalog';
import { pointsNear } from '@/lib/points';
import { categoryLabel, distanceLabel, featureSummary } from '@/lib/format';
import { speak, stopSpeech } from '@/lib/tts';

const LVIV: [number, number] = [24.0316, 49.8419];
const CATEGORIES: Category[] = ['venue', 'transit', 'crossing', 'toilet', 'parking'];

export default function PlacesPage() {
  const { primary } = useProfile();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [query, setQuery] = useState('');
  const [onlyAccessible, setOnlyAccessible] = useState(false);
  const [enabled, setEnabled] = useState<Set<Category>>(new Set(CATEGORIES));
  const [speaking, setSpeaking] = useState(false);

  async function load() {
    setStatus('loading');
    try {
      const [cat, pts] = await Promise.all([getCatalog(), pointsNear(LVIV[0], LVIV[1], 4000)]);
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
  useEffect(() => () => stopSpeech(), []);

  const rated = useMemo(
    () => points.map((p) => ({ point: p, rating: computeRating(p.features, catalog, p.category, primary) as Rating })),
    [points, catalog, primary],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rated.filter(({ point, rating }) => {
      if (!enabled.has(point.category)) return false;
      if (onlyAccessible && rating !== 'full') return false;
      if (q && !point.name.toLowerCase().includes(q) && !(point.address ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rated, query, onlyAccessible, enabled]);

  function toggleCat(c: Category) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }

  function toggleSpeak() {
    if (speaking) { stopSpeech(); setSpeaking(false); return; }
    const ratingWord: Record<Rating, string> = { full: 'доступно', partial: 'частково доступно', none: 'недоступно', unknown: 'немає даних' };
    const items = filtered.slice(0, 8).map(({ point, rating }, i) => {
      const summary = featureSummary(point, catalog, primary);
      return `${i + 1}. ${point.name}, ${categoryLabel[point.category]}, ${distanceLabel(point.distanceM)}, ${ratingWord[rating]}${summary ? `, ${summary}` : ''}.`;
    });
    setSpeaking(true);
    speak(`Поруч ${filtered.length} місць. ${items.join(' ')}`, { onend: () => setSpeaking(false), onerror: () => setSpeaking(false) });
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="places" />
      <main id="main-content" tabIndex={-1} style={{ flex: 1, width: '100%', maxWidth: 'min(100%, 860px)', margin: '0 auto', padding: '1.4em 1.25em 4em', display: 'flex', flexDirection: 'column', gap: '1em' }}>
        <h1 style={{ margin: 0, fontSize: '1.7em', fontWeight: 800 }}>Доступні місця</h1>
        <p style={{ margin: 0, color: 'var(--sc-muted)', lineHeight: 1.5 }}>Шукайте заклади, транспорт і переходи з оцінкою доступності — поруч, за назвою чи адресою.</p>

        <SearchBar value={query} onChange={setQuery} ariaLabel="Пошук місць за назвою чи адресою" placeholder="Пошук за назвою чи адресою…" />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45em', alignItems: 'center' }}>
          <Chip pressed={onlyAccessible} onToggle={() => setOnlyAccessible((v) => !v)}><span aria-hidden>✓</span> Лише доступні</Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c} pressed={enabled.has(c)} onToggle={() => toggleCat(c)}>{categoryLabel[c]}</Chip>
          ))}
          <span style={{ marginLeft: 'auto', color: 'var(--sc-muted)', fontSize: '0.85em' }} aria-live="polite">
            {status === 'ready' ? `${filtered.length} місць` : ''}
          </span>
        </div>

        {status === 'ready' && filtered.length > 0 && (
          <button
            type="button" className="sc-foc" onClick={toggleSpeak}
            aria-label={speaking ? 'Зупинити озвучення' : 'Озвучити місця поруч'}
            style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.45em', minHeight: '2.5em', padding: '0 0.9em', borderRadius: '0.7em', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9em', border: 'var(--sc-bw) solid var(--sc-primary)', background: speaking ? 'var(--sc-primary)' : 'var(--sc-surface)', color: speaking ? 'var(--sc-on-primary)' : 'var(--sc-primary)' }}
          >
            {speaking ? <Square size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}
            {speaking ? 'Зупинити' : 'Озвучити поруч'}
          </button>
        )}

        {status === 'loading' && <LoadingState />}
        {status === 'error' && <ErrorState onRetry={() => void load()} />}
        {status === 'ready' && filtered.length === 0 && (
          <EmptyState title="Нічого не знайдено" message="Спробуйте змінити пошук або фільтри." actionLabel="Скинути" onAction={() => { setQuery(''); setOnlyAccessible(false); setEnabled(new Set(CATEGORIES)); }} />
        )}

        {status === 'ready' && filtered.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', overflow: 'hidden' }}>
            {filtered.map(({ point, rating }, i) => {
              const summary = featureSummary(point, catalog, primary);
              const meta = [categoryLabel[point.category], distanceLabel(point.distanceM), summary || 'немає даних'].join(' · ');
              return (
                <li key={point.id} style={{ borderTop: i ? 'var(--sc-bw) solid var(--sc-border)' : 'none' }}>
                  <ListRow name={point.name} rating={rating} meta={meta} onClick={() => router.push(`/point/${point.id}`)} />
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <Footer />
    </div>
  );
}
