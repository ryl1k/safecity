'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, List, MapPin as MapPinIcon, Search, X } from 'lucide-react';
import type { AccessibilityFeature, Category, PointSummary, Rating } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { AccessibilityMenu } from '@/components/AccessibilityMenu';
import { PointDetailModal } from '@/components/PointDetailModal';
import { useProfile } from '@/profile/ProfileProvider';
import { getCatalog } from '@/lib/catalog';
import { pointById, pointsInBbox, searchPointsByName, type PointHit } from '@/lib/points';
import { problemsInBbox, type ProblemMarker } from '@/lib/civic';
import { geocodePlaces, type GeoPlace } from '@/lib/geocode';
import { categoryLabel } from '@/lib/format';

const LVIV: [number, number] = [24.0316, 49.8419];

const ExploreMap = dynamic(() => import('@/components/ExploreMap').then((m) => m.ExploreMap), { ssr: false });

const CATEGORIES: Category[] = ['venue', 'transit', 'crossing', 'toilet', 'parking'];

export default function ExplorePage() {
  const { primary } = useProfile();
  const router = useRouter();
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [problems, setProblems] = useState<ProblemMarker[]>([]);
  const [showProblems, setShowProblems] = useState(false);
  const [enabled, setEnabled] = useState<Set<Category>>(new Set(CATEGORIES));
  const [onlyAccessible, setOnlyAccessible] = useState(false);
  const [modalId, setModalId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lng: number; lat: number; nonce: number } | null>(null);
  const lastBbox = useRef<{ minLng: number; minLat: number; maxLng: number; maxLat: number } | null>(null);

  // Search
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [pointHits, setPointHits] = useState<PointHit[]>([]);
  const [placeHits, setPlaceHits] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const nonceRef = useRef(0);
  const bboxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void getCatalog().then(setCatalog).catch(() => setCatalog([]));
  }, []);

  // Debounced bbox loading as the user pans/zooms.
  function onMoveEnd(b: { minLng: number; minLat: number; maxLng: number; maxLat: number }) {
    lastBbox.current = b;
    if (bboxTimer.current) clearTimeout(bboxTimer.current);
    bboxTimer.current = setTimeout(() => {
      pointsInBbox(b.minLng, b.minLat, b.maxLng, b.maxLat)
        .then(setPoints)
        .catch(() => {});
      if (showProblems) {
        problemsInBbox(b.minLng, b.minLat, b.maxLng, b.maxLat)
          .then(setProblems)
          .catch(() => {});
      }
    }, 250);
  }

  // Load (or clear) the problems layer when toggled.
  useEffect(() => {
    if (!showProblems) {
      setProblems([]);
      return;
    }
    const b = lastBbox.current;
    if (b) problemsInBbox(b.minLng, b.minLat, b.maxLng, b.maxLat).then(setProblems).catch(() => {});
  }, [showProblems]);

  // Debounced search (points by name + place geocoding), in parallel.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setPointHits([]);
      setPlaceHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const handle = setTimeout(() => {
      void Promise.all([
        searchPointsByName(q).catch(() => [] as PointHit[]),
        geocodePlaces(q, 5, ctrl.signal).catch(() => [] as GeoPlace[]),
      ]).then(([pts, places]) => {
        setPointHits(pts);
        setPlaceHits(places);
        setSearching(false);
      });
    }, 320);
    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [query]);

  const markers = useMemo(() => {
    return points
      .filter((p) => enabled.has(p.category))
      .map((p) => ({
        id: p.id,
        name: p.name,
        lng: p.lng,
        lat: p.lat,
        category: p.category,
        rating: computeRating(p.features, catalog, p.category, primary) as Rating,
      }))
      .filter((m) => (onlyAccessible ? m.rating === 'full' : true));
  }, [points, enabled, onlyAccessible, catalog, primary]);

  function flyTo(lng: number, lat: number) {
    nonceRef.current += 1;
    setFocus({ lng, lat, nonce: nonceRef.current });
  }

  async function pickPoint(id: string) {
    setOpen(false);
    setQuery('');
    const p = await pointById(id).catch(() => null);
    if (p) flyTo(p.lng, p.lat);
    setModalId(id);
  }

  function pickPlace(place: GeoPlace) {
    setOpen(false);
    setQuery(place.label.split(',')[0] ?? '');
    flyTo(place.lng, place.lat);
  }

  // Flat result list for keyboard navigation (points first, then places).
  const flat = useMemo(
    () => [
      ...pointHits.map((p) => ({ kind: 'point' as const, p })),
      ...placeHits.map((pl) => ({ kind: 'place' as const, pl })),
    ],
    [pointHits, placeHits],
  );
  useEffect(() => setActiveIndex(-1), [flat]);

  function selectAt(i: number) {
    const sel = flat[i];
    if (!sel) return;
    if (sel.kind === 'point') void pickPoint(sel.p.id);
    else pickPlace(sel.pl);
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (!flat.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? flat.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      selectAt(activeIndex);
    }
  }

  const hasResults = pointHits.length > 0 || placeHits.length > 0;
  const placeBase = pointHits.length;

  return (
    <main id="main-content" tabIndex={-1} style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <h1 className="sc-sr">Повноекранна мапа доступних місць</h1>
      <p className="sc-sr">Це візуальна мапа. Скористайтеся пошуком, щоб знайти місце чи адресу, або перейдіть до списку місць.</p>
      <ExploreMap
        points={markers}
        problems={problems}
        center={LVIV}
        onSelect={setModalId}
        onSelectProblem={(id) => router.push(`/problem/${id}`)}
        onMoveEnd={onMoveEnd}
        focus={focus}
      />

      {/* Top floating bar — back, search, appearance. Wrapper lets the map show through gaps. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '0.8em', display: 'flex', gap: '0.6em', alignItems: 'flex-start', pointerEvents: 'none' }}>
        <Link href="/map" aria-label="Звичайний вигляд мапи" className="sc-foc" style={{ ...iconBtn, pointerEvents: 'auto', textDecoration: 'none' }}>
          <ArrowLeft size={20} aria-hidden />
        </Link>

        <div style={{ position: 'relative', flex: 1, maxWidth: 520, pointerEvents: 'auto' }}>
          <div style={searchWrap}>
            <Search size={18} aria-hidden style={{ color: 'var(--sc-muted)', flexShrink: 0 }} />
            <input
              className="sc-foc"
              role="combobox"
              aria-expanded={open && hasResults}
              aria-controls="explore-results"
              aria-autocomplete="list"
              aria-activedescendant={activeIndex >= 0 ? `exp-opt-${activeIndex}` : undefined}
              aria-label="Пошук місць або адрес"
              placeholder="Пошук місць, адрес…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onSearchKeyDown}
              style={searchInput}
            />
            {query ? (
              <button type="button" className="sc-foc" aria-label="Очистити" onClick={() => { setQuery(''); setOpen(false); }} style={clearBtn}>
                <X size={16} aria-hidden />
              </button>
            ) : null}
          </div>

          {open && (query.trim().length >= 2) && (
            <ul id="explore-results" role="listbox" aria-label="Результати пошуку" style={results}>
              {searching && !hasResults && <li style={resultMuted}>Пошук…</li>}
              {!searching && !hasResults && <li style={resultMuted}>Нічого не знайдено</li>}

              {pointHits.length > 0 && <li style={resultHead} aria-hidden>Місця SafeCity</li>}
              {pointHits.map((p, i) => (
                <li
                  key={p.id}
                  id={`exp-opt-${i}`}
                  role="option"
                  aria-selected={activeIndex === i}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => void pickPoint(p.id)}
                  style={{ ...resultRow, background: activeIndex === i ? 'var(--sc-primary-tint)' : 'transparent', cursor: 'pointer' }}
                >
                  <MapPinIcon size={16} aria-hidden style={{ color: 'var(--sc-primary)', flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={resultTitle}>{p.name}</span>
                    <span style={resultSub}>{categoryLabel[p.category]}{p.address ? ` · ${p.address}` : ''}</span>
                  </span>
                </li>
              ))}

              {placeHits.length > 0 && <li style={resultHead} aria-hidden>Адреси та місця</li>}
              {placeHits.map((pl, j) => {
                const idx = placeBase + j;
                return (
                  <li
                    key={pl.id}
                    id={`exp-opt-${idx}`}
                    role="option"
                    aria-selected={activeIndex === idx}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => pickPlace(pl)}
                    style={{ ...resultRow, background: activeIndex === idx ? 'var(--sc-primary-tint)' : 'transparent', cursor: 'pointer' }}
                  >
                    <Search size={16} aria-hidden style={{ color: 'var(--sc-muted)', flexShrink: 0 }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={resultTitle}>{pl.label.split(',')[0]}</span>
                      <span style={resultSub}>{pl.label.split(',').slice(1).join(',').trim()}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div style={{ pointerEvents: 'auto' }}>
          <AccessibilityMenu />
        </div>
      </div>

      {/* Bottom-left floating filters — category layers + accessible-only. */}
      <div style={{ position: 'absolute', left: '0.8em', bottom: '0.8em', maxWidth: 'calc(100% - 5em)', display: 'flex', flexWrap: 'wrap', gap: '0.4em', pointerEvents: 'none' }}>
        <FilterChip pressed={onlyAccessible} onToggle={() => setOnlyAccessible((v) => !v)} accent>
          ✓ Лише доступні
        </FilterChip>
        <FilterChip pressed={showProblems} onToggle={() => setShowProblems((v) => !v)}>
          <AlertTriangle size={14} aria-hidden /> Проблеми
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip key={c} pressed={enabled.has(c)} onToggle={() => setEnabled((prev) => toggle(prev, c))}>
            {categoryLabel[c]}
          </FilterChip>
        ))}
        <Link href="/map" className="sc-foc" aria-label="Список місць" style={{ ...chipBase, pointerEvents: 'auto', textDecoration: 'none', color: 'var(--sc-text)' }}>
          <List size={15} aria-hidden /> Список
        </Link>
      </div>

      {modalId && <PointDetailModal id={modalId} onClose={() => setModalId(null)} />}
    </main>
  );
}

function toggle(set: Set<Category>, c: Category): Set<Category> {
  const next = new Set(set);
  if (next.has(c)) next.delete(c);
  else next.add(c);
  return next;
}

function FilterChip({ children, pressed, onToggle, accent }: { children: React.ReactNode; pressed: boolean; onToggle: () => void; accent?: boolean }) {
  return (
    <button
      type="button"
      className="sc-foc"
      aria-pressed={pressed}
      onClick={onToggle}
      style={{
        ...chipBase,
        pointerEvents: 'auto',
        border: `var(--sc-bw) solid ${pressed ? 'var(--sc-primary)' : 'var(--sc-border-strong)'}`,
        background: pressed ? (accent ? 'var(--sc-primary)' : 'var(--sc-primary-tint)') : 'var(--sc-surface)',
        color: pressed ? (accent ? 'var(--sc-on-primary)' : 'var(--sc-primary)') : 'var(--sc-text)',
      }}
    >
      {children}
    </button>
  );
}

const iconBtn = {
  width: '2.9em', height: '2.9em', flexShrink: 0, display: 'grid', placeItems: 'center',
  borderRadius: '0.8em', border: 'var(--sc-bw) solid var(--sc-border)', background: 'var(--sc-surface)',
  color: 'var(--sc-text)', boxShadow: 'var(--sc-shadow-2)', cursor: 'pointer',
} as const;

const searchWrap = {
  display: 'flex', alignItems: 'center', gap: '0.6em', minHeight: '2.9em', padding: '0 0.9em',
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.85em',
  boxShadow: 'var(--sc-shadow-2)',
} as const;
const searchInput = {
  flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: '1em',
  color: 'var(--sc-text)', outline: 'none', minHeight: '2.6em',
} as const;
const clearBtn = {
  border: 'none', background: 'none', color: 'var(--sc-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0,
} as const;

const results = {
  listStyle: 'none', margin: '0.45em 0 0', padding: '0.3em', position: 'absolute', left: 0, right: 0, top: '100%',
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.85em',
  boxShadow: 'var(--sc-shadow-2)', maxHeight: '60vh', overflowY: 'auto',
} as const;
const resultHead = { padding: '0.5em 0.6em 0.2em', fontSize: '0.7em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sc-muted)' } as const;
const resultMuted = { padding: '0.7em 0.6em', color: 'var(--sc-muted)', fontSize: '0.9em' } as const;
const resultRow = {
  display: 'flex', alignItems: 'center', gap: '0.6em', width: '100%', textAlign: 'left', padding: '0.55em 0.6em',
  background: 'none', border: 'none', borderRadius: '0.6em', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--sc-text)',
} as const;
const resultTitle = { display: 'block', fontWeight: 700, fontSize: '0.92em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
const resultSub = { display: 'block', fontSize: '0.78em', color: 'var(--sc-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

const chipBase = {
  display: 'inline-flex', alignItems: 'center', gap: '0.35em', minHeight: '2.4em', padding: '0 0.8em',
  borderRadius: '1.4em', border: 'var(--sc-bw) solid var(--sc-border-strong)', background: 'var(--sc-surface)',
  color: 'var(--sc-text)', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.85em', cursor: 'pointer',
  boxShadow: 'var(--sc-shadow-2)', whiteSpace: 'nowrap',
} as const;
