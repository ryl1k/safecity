'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Volume2, Square } from 'lucide-react';
import type { AccessibilityFeature, Category, PointSummary, Rating } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { SearchBar, Chip, ListRow, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { getCatalog } from '@/lib/catalog';
import {
  CATEGORIES,
  categoryIcon,
  filterPoints,
  MOBILITY_FILTERS,
  ratingOf,
  suggestFilters,
  type FilterState,
} from '@/lib/filters';
import { pointsNear } from '@/lib/points';
import { categoryLabel, distanceLabel, featureSummary } from '@/lib/format';
import { speak, stopSpeech } from '@/lib/tts';

const LVIV: [number, number] = [24.0316, 49.8419];
const RATING_WORD: Record<Rating, string> = {
  full: 'доступно',
  partial: 'частково доступно',
  none: 'недоступно',
  unknown: 'немає даних',
};

export default function PlacesPage() {
  const { primary } = useProfile();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Set<Category>>(new Set());
  const [features, setFeatures] = useState<Set<string>>(new Set());
  const [showInaccessible, setShowInaccessible] = useState(false);
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

  const st: FilterState = { query, categories, features, showInaccessible };
  const filtered = useMemo(
    () => filterPoints(points, catalog, primary, st),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, catalog, primary, query, categories, features, showInaccessible],
  );

  const suggestions = useMemo(() => {
    const s = suggestFilters(query);
    return {
      categories: s.categories.filter((c) => !categories.has(c)),
      features: s.features.filter((f) => !features.has(f.id)),
    };
  }, [query, categories, features]);

  function toggle<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  }

  function toggleSpeak() {
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    const items = filtered.slice(0, 8).map((p, i) => {
      const summary = featureSummary(p, catalog, primary);
      return `${i + 1}. ${p.name}, ${categoryLabel[p.category]}, ${distanceLabel(p.distanceM)}, ${RATING_WORD[ratingOf(p, catalog, primary)]}${summary ? `, ${summary}` : ''}.`;
    });
    setSpeaking(true);
    speak(`Знайдено ${filtered.length} місць. ${items.join(' ')}`, {
      onend: () => setSpeaking(false),
      onerror: () => setSpeaking(false),
    });
  }

  const hasSuggestions = suggestions.categories.length > 0 || suggestions.features.length > 0;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="places" />
      <main
        id="main-content"
        tabIndex={-1}
        style={{ flex: 1, width: '100%', maxWidth: 'min(100%, 860px)', margin: '0 auto', padding: '1.4em 1.25em 4em', display: 'flex', flexDirection: 'column', gap: '1em' }}
      >
        <h1 style={{ margin: 0, fontSize: '1.7em', fontWeight: 800 }}>Доступні місця</h1>
        <p style={{ margin: 0, color: 'var(--sc-muted)', lineHeight: 1.5 }}>
          Шукайте заклади, транспорт і переходи — за назвою, категорією чи зручністю доступності.
        </p>

        <SearchBar value={query} onChange={setQuery} ariaLabel="Пошук місць, категорій чи зручностей" placeholder="Пошук місця, категорії чи зручності…" />

        {/* Smart-search: turn a query into a filter */}
        {hasSuggestions && (
          <div style={chipRow}>
            {suggestions.categories.map((c) => (
              <Chip key={`s-${c}`} pressed={false} onToggle={() => { setCategories((s) => toggle(s, c)); setQuery(''); }}>
                + {categoryIcon[c]} {categoryLabel[c]}
              </Chip>
            ))}
            {suggestions.features.map((f) => (
              <Chip key={`s-${f.id}`} pressed={false} onToggle={() => { setFeatures((s) => toggle(s, f.id)); setQuery(''); }}>
                + {f.label}
              </Chip>
            ))}
          </div>
        )}

        {/* Category filters */}
        <div style={chipRow}>
          {CATEGORIES.map((c) => (
            <Chip key={c} pressed={categories.has(c)} onToggle={() => setCategories((s) => toggle(s, c))}>
              {categoryIcon[c]} {categoryLabel[c]}
            </Chip>
          ))}
        </div>

        {/* Mobility feature filters */}
        <div style={chipRow}>
          {MOBILITY_FILTERS.map((f) => (
            <Chip key={f.id} pressed={features.has(f.id)} onToggle={() => setFeatures((s) => toggle(s, f.id))}>
              {f.label}
            </Chip>
          ))}
          <Chip pressed={showInaccessible} onToggle={() => setShowInaccessible((v) => !v)}>
            Показати недоступні
          </Chip>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em', flexWrap: 'wrap' }}>
          <span aria-live="polite" style={{ color: 'var(--sc-muted)', fontSize: '0.85em' }}>
            {status === 'ready' ? `${filtered.length} місць` : ''}
          </span>
          {status === 'ready' && filtered.length > 0 && (
            <button
              type="button"
              className="sc-foc"
              onClick={toggleSpeak}
              aria-label={speaking ? 'Зупинити озвучення' : 'Озвучити знайдені місця'}
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.45em', minHeight: '2.5em', padding: '0 0.9em', borderRadius: '0.7em', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9em', border: 'var(--sc-bw) solid var(--sc-primary)', background: speaking ? 'var(--sc-primary)' : 'var(--sc-surface)', color: speaking ? 'var(--sc-on-primary)' : 'var(--sc-primary)' }}
            >
              {speaking ? <Square size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}
              {speaking ? 'Зупинити' : 'Озвучити'}
            </button>
          )}
        </div>

        {status === 'loading' && <LoadingState />}
        {status === 'error' && <ErrorState onRetry={() => void load()} />}
        {status === 'ready' && filtered.length === 0 && (
          <EmptyState
            title="Нічого не знайдено"
            message="Спробуйте змінити пошук або фільтри."
            actionLabel="Скинути"
            onAction={() => { setQuery(''); setCategories(new Set()); setFeatures(new Set()); setShowInaccessible(false); }}
          />
        )}

        {status === 'ready' && filtered.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', overflow: 'hidden' }}>
            {filtered.map((point, i) => {
              const summary = featureSummary(point, catalog, primary);
              const meta = [categoryLabel[point.category], distanceLabel(point.distanceM), summary || 'немає даних'].join(' · ');
              return (
                <li key={point.id} style={{ borderTop: i ? 'var(--sc-bw) solid var(--sc-border)' : 'none' }}>
                  <ListRow
                    name={point.name}
                    rating={ratingOf(point, catalog, primary)}
                    icon={categoryIcon[point.category]}
                    meta={meta}
                    onClick={() => router.push(`/point/${point.id}`)}
                  />
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

const chipRow = { display: 'flex', flexWrap: 'wrap', gap: '0.45em', alignItems: 'center' } as const;
