'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccessibilityFeature, AccessLevel, Category, PointSummary } from '@safecity/shared';
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
  levelOf,
  levelLabel,
  levelColor,
  suggestFilters,
  type FilterState,
} from '@/lib/filters';
import { pointsNear } from '@/lib/points';
import { reviewStats, type ReviewStat } from '@/lib/reviews';
import { categoryLabel, distanceLabel, featureSummary } from '@/lib/format';
import { CITIES, DEFAULT_CITY_ID, cityById, loadCity, saveCity, type City } from '@/lib/cities';

export default function PlacesPage() {
  const router = useRouter();
  const [city, setCityState] = useState<City>(() => cityById(DEFAULT_CITY_ID));
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [stats, setStats] = useState<Record<string, ReviewStat>>({});
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Set<Category>>(new Set());
  const [features, setFeatures] = useState<Set<string>>(new Set());
  const [levels, setLevels] = useState<Set<AccessLevel>>(new Set());

  async function load(c: City) {
    setStatus('loading');
    try {
      const [cat, pts, rs] = await Promise.all([
        getCatalog(),
        // Wide radius so showcase points spread across a big city are included.
        pointsNear(c.lng, c.lat, 15000),
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
    const c = loadCity();
    setCityState(c);
    void load(c);
  }, []);

  function switchCity(id: string) {
    const c = cityById(id);
    setCityState(c);
    saveCity(c.id);
    void load(c);
  }

  const st: FilterState = { query, categories, features, levels };
  const filtered = useMemo(
    () => filterPoints(points, catalog, st),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, catalog, query, categories, features, levels],
  );
  function toggleLevel(l: AccessLevel) { setLevels((prev) => { const n = new Set(prev); n.has(l) ? n.delete(l) : n.add(l); return n; }); }
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
        className="sc-stagger"
        style={{ flex: 1, width: '100%', maxWidth: 'min(100%, 860px)', margin: '0 auto', padding: '1.4em 1.25em 4em', display: 'flex', flexDirection: 'column', gap: '1em' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: '1.7em', fontWeight: 800, flex: '1 1 auto', minWidth: 0 }}>Доступні місця</h1>
          <select
            className="sc-foc"
            aria-label="Місто"
            value={city.id}
            onChange={(e) => switchCity(e.target.value)}
            style={{ minHeight: '2.6em', padding: '0 0.8em', borderRadius: '0.7em', border: 'var(--sc-bw) solid var(--sc-border-strong)', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9em', cursor: 'pointer' }}
          >
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
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
          {(['high', 'medium', 'low'] as AccessLevel[]).map((l) => (
            <Chip key={l} pressed={levels.has(l)} onToggle={() => toggleLevel(l)}>
              <span aria-hidden style={{ display: 'inline-block', width: '0.55em', height: '0.55em', borderRadius: '50%', background: levelColor[l], marginRight: '0.4em', verticalAlign: 'middle' }} />
              {levelLabel[l]}
            </Chip>
          ))}
        </div>

        <span aria-live="polite" style={{ color: 'var(--sc-muted)', fontSize: '0.85em' }}>
          {status === 'ready' ? `${filtered.length} місць` : ''}
        </span>

        {status === 'loading' && <LoadingState />}
        {status === 'error' && <ErrorState onRetry={() => void load(city)} />}
        {status === 'ready' && filtered.length === 0 && (
          <EmptyState
            title="Нічого не знайдено"
            message="Спробуйте змінити пошук або фільтри."
            actionLabel="Скинути"
            onAction={() => { setQuery(''); setCategories(new Set()); setFeatures(new Set()); setLevels(new Set()); }}
          />
        )}

        {status === 'ready' && filtered.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', overflow: 'hidden' }}>
            {filtered.map((point, i) => {
              const summary = featureSummary(point, catalog, 'wheelchair');
              const meta = [categoryLabel[point.category], distanceLabel(point.distanceM), summary || 'немає даних'].join(' · ');
              const lvl = levelOf(point, catalog);
              return (
                <li key={point.id} style={{ borderTop: i ? 'var(--sc-bw) solid var(--sc-border)' : 'none' }}>
                  <ListRow
                    name={point.name}
                    badge={{ label: levelLabel[lvl], color: levelColor[lvl] }}
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
