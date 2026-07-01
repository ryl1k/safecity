'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccessibilityFeature, Category, PointSummary } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { SearchBar, Chip, ListRow, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { CategoryIcon } from '@/components/CategoryIcon';
import { PlaceIcon } from '@/components/PlaceIcon';
import { getCatalog } from '@/lib/catalog';
import {
  CATEGORIES,
  categoryColor,
  featuresForCategories,
  filterPoints,
  ratingOf,
  suggestFilters,
  type FilterState,
} from '@/lib/filters';
import { pointsNear } from '@/lib/points';
import { reviewStats, type ReviewStat } from '@/lib/reviews';
import { categoryLabel, distanceLabel, featureSummary } from '@/lib/format';

const LVIV: [number, number] = [24.0316, 49.8419];

export default function PlacesPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [stats, setStats] = useState<Record<string, ReviewStat>>({});
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Set<Category>>(new Set());
  const [features, setFeatures] = useState<Set<string>>(new Set());
  const [showInaccessible, setShowInaccessible] = useState(false);

  async function load() {
    setStatus('loading');
    try {
      const [cat, pts, rs] = await Promise.all([
        getCatalog(),
        pointsNear(LVIV[0], LVIV[1], 4000),
        reviewStats().catch(() => ({})),
      ]);
      setCatalog(cat);
      setPoints(pts);
      setStats(rs);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }
  useEffect(() => {
    void load();
  }, []);

  const st: FilterState = { query, categories, features, showInaccessible };
  const filtered = useMemo(
    () => filterPoints(points, catalog, st),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, catalog, query, categories, features, showInaccessible],
  );
  const featureChips = useMemo(() => featuresForCategories(catalog, categories), [catalog, categories]);

  const suggestions = useMemo(() => {
    const s = suggestFilters(query, catalog);
    return {
      categories: s.categories.filter((c) => !categories.has(c)),
      features: s.features.filter((f) => !features.has(f.key)),
    };
  }, [query, catalog, categories, features]);

  function toggle<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
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
                <span style={chipInner}>+ <CategoryIcon category={c} size={15} /> {categoryLabel[c]}</span>
              </Chip>
            ))}
            {suggestions.features.map((f) => (
              <Chip key={`s-${f.key}`} pressed={false} onToggle={() => { setFeatures((s) => toggle(s, f.key)); setQuery(''); }}>
                + {f.label}
              </Chip>
            ))}
          </div>
        )}

        {/* Category filters */}
        <div style={chipRow}>
          {CATEGORIES.map((c) => (
            <Chip key={c} pressed={categories.has(c)} onToggle={() => setCategories((s) => toggle(s, c))}>
              <span style={chipInner}>
                <CategoryIcon category={c} size={15} color={categories.has(c) ? 'var(--sc-on-primary)' : categoryColor[c]} />
                {categoryLabel[c]}
              </span>
            </Chip>
          ))}
        </div>

        {/* Mobility feature filters — adapt to the selected category */}
        <div style={chipRow}>
          {featureChips.map((f) => (
            <Chip key={f.key} pressed={features.has(f.key)} onToggle={() => setFeatures((s) => toggle(s, f.key))}>
              {f.label}
            </Chip>
          ))}
          <Chip pressed={showInaccessible} onToggle={() => setShowInaccessible((v) => !v)}>
            Показати недоступні
          </Chip>
        </div>

        <span aria-live="polite" style={{ color: 'var(--sc-muted)', fontSize: '0.85em' }}>
          {status === 'ready' ? `${filtered.length} місць` : ''}
        </span>

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
              const summary = featureSummary(point, catalog, 'wheelchair');
              const meta = [categoryLabel[point.category], distanceLabel(point.distanceM), summary || 'немає даних'].join(' · ');
              return (
                <li key={point.id} style={{ borderTop: i ? 'var(--sc-bw) solid var(--sc-border)' : 'none' }}>
                  <ListRow
                    name={point.name}
                    rating={ratingOf(point, catalog)}
                    icon={<PlaceIcon category={point.category} name={point.name} size={20} />}
                    stars={stats[point.id]?.avg}
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
const chipInner = { display: 'inline-flex', alignItems: 'center', gap: '0.35em' } as const;
