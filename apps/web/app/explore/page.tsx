'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, List, MapPin as MapPinIcon, Search, X } from 'lucide-react';
import type { AccessibilityFeature, Category, PointSummary, Rating } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { AccessibilityMenu } from '@/components/AccessibilityMenu';
import { PointDetailModal } from '@/components/PointDetailModal';
import { useProfile } from '@/profile/ProfileProvider';
import { getCatalog } from '@/lib/catalog';
import { pointById, pointsInBbox, searchPointsByName, type PointHit } from '@/lib/points';
import { geocodePlaces, type GeoPlace } from '@/lib/geocode';
import { categoryLabel } from '@/lib/format';

const LVIV: [number, number] = [24.0316, 49.8419];

const ExploreMap = dynamic(() => import('@/components/ExploreMap').then((m) => m.ExploreMap), { ssr: false });

const CATEGORIES: Category[] = ['venue', 'transit', 'crossing', 'toilet', 'parking'];

export default function ExplorePage() {
  const { primary } = useProfile();
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [enabled, setEnabled] = useState<Set<Category>>(new Set(CATEGORIES));
  const [onlyAccessible, setOnlyAccessible] = useState(false);
  const [modalId, setModalId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lng: number; lat: number; nonce: number } | null>(null);

  // Search
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [pointHits, setPointHits] = useState<PointHit[]>([]);
  const [placeHits, setPlaceHits] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const nonceRef = useRef(0);
  const bboxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void getCatalog().then(setCatalog).catch(() => setCatalog([]));
  }, []);

  // Debounced bbox loading as the user pans/zooms.
  function onMoveEnd(b: { minLng: number; minLat: number; maxLng: number; maxLat: number }) {
    if (bboxTimer.current) clearTimeout(bboxTimer.current);
    bboxTimer.current = setTimeout(() => {
      pointsInBbox(b.minLng, b.minLat, b.maxLng, b.maxLat)
        .then(setPoints)
        .catch(() => {});
    }, 250);
  }

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

  const hasResults = pointHits.length > 0 || placeHits.length > 0;

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <ExploreMap points={markers} center={LVIV} onSelect={setModalId} onMoveEnd={onMoveEnd} focus={focus} />

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
              aria-label="Пошук місць або адрес"
              placeholder="Пошук місць, адрес…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setOpen(false);
                  (e.target as HTMLInputElement).blur();
                }
              }}
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
              {pointHits.map((p) => (
                <li key={p.id} role="option" aria-selected={false}>
                  <button type="button" className="sc-foc" onClick={() => void pickPoint(p.id)} style={resultRow}>
                    <MapPinIcon size={16} aria-hidden style={{ color: 'var(--sc-primary)', flexShrink: 0 }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={resultTitle}>{p.name}</span>
                      <span style={resultSub}>{categoryLabel[p.category]}{p.address ? ` · ${p.address}` : ''}</span>
                    </span>
                  </button>
                </li>
              ))}

              {placeHits.length > 0 && <li style={resultHead} aria-hidden>Адреси та місця</li>}
              {placeHits.map((pl) => (
                <li key={pl.id} role="option" aria-selected={false}>
                  <button type="button" className="sc-foc" onClick={() => pickPlace(pl)} style={resultRow}>
                    <Search size={16} aria-hidden style={{ color: 'var(--sc-muted)', flexShrink: 0 }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={resultTitle}>{pl.label.split(',')[0]}</span>
                      <span style={resultSub}>{pl.label.split(',').slice(1).join(',').trim()}</span>
                    </span>
                  </button>
                </li>
              ))}
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
    </div>
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
