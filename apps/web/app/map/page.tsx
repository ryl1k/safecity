'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal, Check, MapPin as MapPinIcon, Search, X } from 'lucide-react';
import type { AccessibilityFeature, AccessLevel, Category, PointSummary } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { PointDetailModal, RouteTabContent } from '@/components/PointDetailModal';
import type { RouteDisplay } from '@/components/ExploreMap';
import { LoadingState } from '@/components/ui';
import { getCatalog } from '@/lib/catalog';
import { pointsInBbox, pointById, searchPointsByName, type PointHit } from '@/lib/points';
import { problemsInBbox, type ProblemMarker } from '@/lib/civic';
import { reviewStats, type ReviewStat } from '@/lib/reviews';
import { geocodePlaces, reverseGeocode, type GeoPlace } from '@/lib/geocode';
import { featuresForCategories, levelOf, levelLabel, levelColor, suggestFilters } from '@/lib/filters';
import { categoryLabel } from '@/lib/format';
import { DEFAULT_CITY_ID, cityBbox, cityById, loadCity, type City } from '@/lib/cities';
import { segmentsInBbox, type StreetSegment } from '@/lib/segments';
import { StreetSegmentPanel } from '@/components/StreetSegmentPanel';
import type { ExploreSegment } from '@/components/ExploreMap';

const CATEGORIES: Category[] = ['venue', 'transit', 'crossing', 'toilet', 'parking'];

const ExploreMap = dynamic(() => import('@/components/ExploreMap').then((m) => m.ExploreMap), { ssr: false });

// Filterable accessibility levels, best-first (the weighted model never yields 'unknown').
const LEVEL_ORDER: AccessLevel[] = ['high', 'medium', 'low'];

interface Bbox { minLng: number; minLat: number; maxLng: number; maxLat: number; zoom?: number }

export default function MapPage() {
  const router = useRouter();
  // Selected city (persisted). SSR renders the default; the stored city is
  // synced on mount to avoid a hydration mismatch.
  const [city, setCityState] = useState<City>(() => cityById(DEFAULT_CITY_ID));
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [stats, setStats] = useState<Record<string, ReviewStat>>({});
  const [levelFilter, setLevelFilter] = useState<Set<AccessLevel>>(new Set());
  const [features, setFeatures] = useState<Set<string>>(new Set());
  const [enabled, setEnabled] = useState<Set<Category>>(new Set(CATEGORIES));
  const [showProblems, setShowProblems] = useState(false);
  const [problems, setProblems] = useState<ProblemMarker[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [modalId, setModalId] = useState<string | null>(null);
  const [dropped, setDropped] = useState<{ lng: number; lat: number; address: string | null } | null>(null);
  const [routeDir, setRouteDir] = useState<'to' | 'from' | null>(null);
  const [pickFromCb, setPickFromCb] = useState<((lng: number, lat: number) => void) | null>(null);
  const [routeDisplay, setRouteDisplay] = useState<RouteDisplay | null>(null);
  const [segments, setSegments] = useState<StreetSegment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lng: number; lat: number; nonce: number; zoom?: number; bounds?: [[number, number], [number, number]] } | null>(null);
  const lastBbox = useRef<Bbox | null>(null);
  const loadedBboxRef = useRef<Bbox | null>(null);
  const nonceRef = useRef(0);
  const bboxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [pointHits, setPointHits] = useState<PointHit[]>([]);
  const [placeHits, setPlaceHits] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Desktop puts search in the navbar; mobile floats it on the map.
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Zooming far out makes MapLibre's bounds exceed ±180 lng / ±90 lat; the API
  // rejects those, so clamp to the valid world before every fetch.
  function clampBbox(b: Bbox): Bbox {
    return {
      minLng: Math.max(-180, Math.min(180, b.minLng)),
      maxLng: Math.max(-180, Math.min(180, b.maxLng)),
      minLat: Math.max(-90, Math.min(90, b.minLat)),
      maxLat: Math.max(-90, Math.min(90, b.maxLat)),
      zoom: b.zoom,
    };
  }

  async function loadPoints(bb: Bbox) {
    const c = clampBbox(bb);
    try {
      setPoints(await pointsInBbox(c.minLng, c.minLat, c.maxLng, c.maxLat));
      loadedBboxRef.current = c;
      setStatus('ready');
    } catch {
      // Only fail hard on the very first load; a later hiccup must not nuke a live map.
      setStatus((s) => (s === 'loading' ? 'error' : s));
    }
  }

  async function loadSegments(bb: Bbox, fit = false) {
    const c = clampBbox(bb);
    try {
      const segs = await segmentsInBbox(c.minLng, c.minLat, c.maxLng, c.maxLat);
      setSegments(segs);
      // On a city switch, frame the map to the segments so the (scattered,
      // often off-centre) accessibility data is visible instead of an empty
      // civic-centre view. Bounded to the city bbox, so it can't over-zoom-out.
      if (fit) {
        const b = segmentsBounds(segs);
        if (b) {
          nonceRef.current += 1;
          setFocus({
            lng: (b.minLng + b.maxLng) / 2,
            lat: (b.minLat + b.maxLat) / 2,
            nonce: nonceRef.current,
            bounds: [[b.minLng, b.minLat], [b.maxLng, b.maxLat]],
          });
        }
      }
    } catch { /* segments are non-critical — silently skip */ }
  }

  // Bounding box of a set of segments (from their LineString geojson), or null.
  function segmentsBounds(segs: StreetSegment[]): Bbox | null {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    let any = false;
    for (const s of segs) {
      try {
        const g = JSON.parse(s.geojson);
        const coords: [number, number][] = g?.type === 'LineString' ? g.coordinates : [];
        for (const [lng, lat] of coords) {
          any = true;
          if (lng < minLng) minLng = lng;
          if (lat < minLat) minLat = lat;
          if (lng > maxLng) maxLng = lng;
          if (lat > maxLat) maxLat = lat;
        }
      } catch { /* skip malformed geometry */ }
    }
    return any ? { minLng, minLat, maxLng, maxLat } : null;
  }

  useEffect(() => {
    void getCatalog().then(setCatalog).catch(() => setCatalog([]));
    void reviewStats().then(setStats).catch(() => {});
    const c = loadCity();
    setCityState(c);
    if (c.id !== DEFAULT_CITY_ID) {
      nonceRef.current += 1;
      setFocus({ lng: c.lng, lat: c.lat, nonce: nonceRef.current, zoom: 12.5 });
    }
    void loadPoints(cityBbox(c));
    void loadSegments(cityBbox(c), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onMoveEnd(b: Bbox) {
    lastBbox.current = b;
    const loaded = loadedBboxRef.current;
    const covered =
      !!loaded && b.minLng >= loaded.minLng && b.maxLng <= loaded.maxLng && b.minLat >= loaded.minLat && b.maxLat <= loaded.maxLat;
    if (bboxTimer.current) clearTimeout(bboxTimer.current);
    bboxTimer.current = setTimeout(() => {
      // Only fetch when the viewport leaves the loaded area (e.g. panning far out).
      if (!covered) {
        const w = b.maxLng - b.minLng;
        const h = b.maxLat - b.minLat;
        void loadPoints({ minLng: b.minLng - w, minLat: b.minLat - h, maxLng: b.maxLng + w, maxLat: b.maxLat + h });
        void loadSegments({ minLng: b.minLng - w, minLat: b.minLat - h, maxLng: b.maxLng + w, maxLat: b.maxLat + h });
      }
      if (showProblems) problemsInBbox(b.minLng, b.minLat, b.maxLng, b.maxLat).then(setProblems).catch(() => {});
    }, 300);
  }

  useEffect(() => {
    if (!showProblems) { setProblems([]); return; }
    const b = lastBbox.current;
    if (b) problemsInBbox(b.minLng, b.minLat, b.maxLng, b.maxLat).then(setProblems).catch(() => {});
  }, [showProblems]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setPointHits([]); setPlaceHits([]); setSearching(false); return; }
    setSearching(true);
    const ctrl = new AbortController();
    const handle = setTimeout(() => {
      void Promise.all([
        searchPointsByName(q).catch(() => [] as PointHit[]),
        geocodePlaces(q, 5, ctrl.signal).catch(() => [] as GeoPlace[]),
      ]).then(([pts, places]) => { setPointHits(pts); setPlaceHits(places); setSearching(false); });
    }, 320);
    return () => { clearTimeout(handle); ctrl.abort(); };
  }, [query]);

  // All points matching the filters (the count shown to the user).
  const matching = useMemo(() => {
    const keys = [...features];
    return points
      .filter((p) => enabled.has(p.category))
      .filter((p) => {
        // Feature chips require every chosen amenity; the level chips keep only the
        // selected inclusiveness levels. Both combine; empty = show everything.
        if (keys.length && !keys.every((k) => p.features[k] === 'yes')) return false;
        if (levelFilter.size > 0 && !levelFilter.has(levelOf(p, catalog))) return false;
        return true;
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        lng: p.lng,
        lat: p.lat,
        category: p.category,
        level: levelOf(p, catalog),
      }));
  }, [points, enabled, features, levelFilter, catalog]);

  // Shape segments for ExploreMap (only the fields the map layer needs).
  const exploreSegments = useMemo<ExploreSegment[]>(
    () => segments.map((s) => ({ id: s.id, streetName: s.streetName, rating: s.rating, geojson: s.geojson })),
    [segments],
  );

  const selectedSegment = selectedSegmentId ? segments.find((s) => s.id === selectedSegmentId) ?? null : null;

  // Stable seed for routing from/to the dropped marker (identity changes only
  // when the marker moves / its address resolves — never every render).
  const markerSeed = useMemo(
    () => (dropped ? { coords: [dropped.lng, dropped.lat] as [number, number], label: dropped.address ?? `${dropped.lat.toFixed(5)}, ${dropped.lng.toFixed(5)}` } : null),
    [dropped],
  );


  function flyTo(lng: number, lat: number) { nonceRef.current += 1; setFocus({ lng, lat, nonce: nonceRef.current }); }
  async function pickPoint(id: string) { setOpen(false); setQuery(''); const p = await pointById(id).catch(() => null); if (p) flyTo(p.lng, p.lat); setModalId(id); }

  // Drop a marker at coords, then resolve its address in the background.
  function dropAt(lng: number, lat: number) {
    setRouteDir(null);
    setModalId(null);
    setDropped({ lng, lat, address: null });
    void reverseGeocode(lng, lat).then((addr) =>
      setDropped((d) => (d && d.lng === lng && d.lat === lat ? { ...d, address: addr } : d)),
    );
  }
  function clearDropped() { setDropped(null); setRouteDir(null); setRouteDisplay(null); setPickFromCb(null); }

  // Picking a search result drops a marker there with its known address (no reverse lookup needed).
  function pickPlace(place: GeoPlace) {
    setOpen(false); setQuery(place.label.split(',')[0] ?? '');
    setRouteDir(null); setModalId(null);
    setDropped({ lng: place.lng, lat: place.lat, address: place.label });
    flyTo(place.lng, place.lat);
  }

  const flat = useMemo(
    () => [...pointHits.map((p) => ({ kind: 'point' as const, p })), ...placeHits.map((pl) => ({ kind: 'place' as const, pl }))],
    [pointHits, placeHits],
  );
  useEffect(() => setActiveIndex(-1), [flat]);
  function selectAt(i: number) { const s = flat[i]; if (!s) return; s.kind === 'point' ? void pickPoint(s.p.id) : pickPlace(s.pl); }
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); return; }
    if (!flat.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActiveIndex((i) => (i + 1) % flat.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (i <= 0 ? flat.length - 1 : i - 1)); }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); selectAt(activeIndex); }
  }
  const hasResults = pointHits.length > 0 || placeHits.length > 0;
  const placeBase = pointHits.length;
  const filterSugs = suggestFilters(query, catalog);
  const featureChips = featuresForCategories(catalog, enabled);

  function toggleCat(c: Category) { setEnabled((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; }); }
  function toggleFeature(id: string) { setFeatures((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  const activeFilters = levelFilter.size + features.size + (showProblems ? 1 : 0) + (CATEGORIES.length - enabled.size);
  function toggleLevel(l: AccessLevel) { setLevelFilter((prev) => { const n = new Set(prev); n.has(l) ? n.delete(l) : n.add(l); return n; }); }

  useEffect(() => {
    if (!filtersOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [filtersOpen]);

  // The search UI, reused in the navbar (desktop) or floating on the map (mobile).
  const searchBox = (
    <>
      <div style={searchWrap}>
        <Search size={18} aria-hidden style={{ color: 'var(--sc-muted)', flexShrink: 0 }} />
        <input
          className="sc-foc" role="combobox" aria-expanded={open && hasResults} aria-controls="map-results" aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `map-opt-${activeIndex}` : undefined}
          aria-label="Пошук місць або адрес" placeholder="Пошук місць, адрес…" value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onSearchKeyDown} style={searchInput}
        />
        {query ? <button type="button" className="sc-foc" aria-label="Очистити" onClick={() => { setQuery(''); setOpen(false); }} style={clearBtn}><X size={16} aria-hidden /></button> : null}
      </div>
      {open && query.trim().length >= 2 && (
        <ul id="map-results" role="listbox" aria-label="Результати пошуку" style={results}>
          {filterSugs.categories.length + filterSugs.features.length > 0 && (
            <>
              <li style={resultHead} aria-hidden>Додати фільтр</li>
              {filterSugs.categories.map((c) => (
                <li key={`fc-${c}`} role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => { setEnabled(new Set([c])); setOpen(false); setQuery(''); }} style={resultRow}>
                  <SlidersHorizontal size={16} aria-hidden style={{ color: 'var(--sc-primary)', flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={resultTitle}>{categoryLabel[c]}</span>
                    <span style={resultSub}>Лише ця категорія</span>
                  </span>
                </li>
              ))}
              {filterSugs.features.map((f) => (
                <li key={`ff-${f.key}`} role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => { toggleFeature(f.key); setOpen(false); setQuery(''); }} style={resultRow}>
                  <SlidersHorizontal size={16} aria-hidden style={{ color: 'var(--sc-primary)', flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={resultTitle}>{f.label}</span>
                    <span style={resultSub}>Зручність доступності</span>
                  </span>
                </li>
              ))}
            </>
          )}
          {searching && !hasResults && <li style={resultMuted}>Пошук…</li>}
          {!searching && !hasResults && <li style={resultMuted}>Нічого не знайдено</li>}
          {pointHits.length > 0 && <li style={resultHead} aria-hidden>Місця SafeCity</li>}
          {pointHits.map((p, i) => {
            const lvl = levelOf({ features: p.features, category: p.category } as PointSummary, catalog);
            return (
            <li key={p.id} id={`map-opt-${i}`} role="option" aria-selected={activeIndex === i} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActiveIndex(i)} onClick={() => void pickPoint(p.id)} style={{ ...resultRow, background: activeIndex === i ? 'var(--sc-primary-tint)' : 'transparent' }}>
              <MapPinIcon size={16} aria-hidden style={{ color: 'var(--sc-primary)', flexShrink: 0 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={resultTitle}>{p.name}</span>
                <span style={resultSub}>
                  <span aria-hidden style={{ display: 'inline-block', width: '0.55em', height: '0.55em', borderRadius: '50%', background: levelColor[lvl], marginRight: '0.4em', verticalAlign: 'baseline' }} />
                  {levelLabel[lvl]}{p.address ? ` · ${p.address}` : ` · ${categoryLabel[p.category]}`}
                </span>
              </span>
              {((s) => (s ? <span style={{ flexShrink: 0, fontSize: '0.8em', fontWeight: 800, color: 'var(--sc-warn)' }}>★ {s.avg.toFixed(1)}</span> : null))(stats[p.id])}
            </li>
            );
          })}
          {placeHits.length > 0 && <li style={resultHead} aria-hidden>Адреси та місця</li>}
          {placeHits.map((pl, j) => { const idx = placeBase + j; return (
            <li key={pl.id} id={`map-opt-${idx}`} role="option" aria-selected={activeIndex === idx} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActiveIndex(idx)} onClick={() => pickPlace(pl)} style={{ ...resultRow, background: activeIndex === idx ? 'var(--sc-primary-tint)' : 'transparent' }}>
              <Search size={16} aria-hidden style={{ color: 'var(--sc-muted)', flexShrink: 0 }} />
              <span style={{ minWidth: 0 }}><span style={resultTitle}>{pl.label.split(',')[0]}</span><span style={resultSub}>{pl.label.split(',').slice(1).join(',').trim()}</span></span>
            </li>
          ); })}
        </ul>
      )}
    </>
  );

  return (
    <div style={{ height: 'calc(100dvh - var(--sc-bottomnav-h))', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="map" search={isDesktop ? searchBox : undefined} />
      <main id="main-content" tabIndex={-1} style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <h1 className="sc-sr">Мапа доступних місць</h1>

        {status === 'error' ? (
          <div style={{ padding: '2em 1.25em' }}><LoadingState label="Повторне завантаження…" /></div>
        ) : (
          <ExploreMap
            points={matching}
            problems={problems}
            segments={exploreSegments}
            center={[city.lng, city.lat]}
            onSelect={(id) => { setModalId(id); setSelectedSegmentId(null); }}
            onSelectProblem={(id) => router.push(`/problem/${id}`)}
            onSelectSegment={(id) => { setSelectedSegmentId(id); setModalId(null); setDropped(null); }}
            onMoveEnd={onMoveEnd}
            focus={focus}
            pickMode={pickFromCb !== null}
            onMapClick={(lng, lat) => {
              if (pickFromCb) { pickFromCb(lng, lat); setPickFromCb(null); }
              else if (!routeDir) dropAt(lng, lat);
            }}
            route={routeDisplay}
            marker={dropped ? { lng: dropped.lng, lat: dropped.lat } : null}
            onMarkerMove={dropAt}
          />
        )}

        {/* Floating search — mobile only; desktop puts it in the navbar. Right gap
            leaves room for the filter button so they don't overlap on phones. */}
        {!isDesktop && !pickFromCb && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: '3.6em', padding: '0.8em', display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 560, pointerEvents: 'auto' }}>{searchBox}</div>
          </div>
        )}

        {/* Pick-a-point hint — shown while the sheet is hidden for map tapping. */}
        {!isDesktop && pickFromCb && (
          <div className="sc-map-pickhint" role="status">Торкніться мапи, щоб обрати точку</div>
        )}

        {/* Filters popover (top-right) */}
        <div ref={filterRef} style={{ position: 'absolute', right: '0.8em', top: '0.8em' }}>
          <button
            type="button" className="sc-foc" aria-haspopup="dialog" aria-expanded={filtersOpen} aria-label="Фільтри"
            onClick={() => setFiltersOpen((o) => !o)} style={filterTrigger}
          >
            <SlidersHorizontal size={16} aria-hidden />{isDesktop ? ' Фільтри' : ''}
            {activeFilters > 0 && <span aria-label={`${activeFilters} активних`} style={filterBadge}>{activeFilters}</span>}
          </button>
          {filtersOpen && (
            <>
              <div role="dialog" aria-label="Фільтри мапи" style={filterPanel}>
                <div style={{ fontSize: '0.72em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sc-muted)', marginBottom: '0.4em' }}>Рівень доступності</div>
                <div style={{ display: 'flex', gap: '0.4em', flexWrap: 'wrap', marginBottom: '0.6em' }}>
                  {LEVEL_ORDER.map((l) => {
                    const on = levelFilter.has(l);
                    return (
                      <button key={l} type="button" className="sc-foc" aria-pressed={on} onClick={() => toggleLevel(l)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', padding: '0.35em 0.7em', borderRadius: '2em', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.82em',
                          border: `var(--sc-bw) solid ${on ? levelColor[l] : 'var(--sc-border-strong)'}`,
                          background: on ? levelColor[l] : 'transparent', color: on ? '#fff' : 'var(--sc-text)' }}>
                        <span aria-hidden style={{ width: '0.55em', height: '0.55em', borderRadius: '50%', background: on ? '#fff' : levelColor[l] }} />
                        {levelLabel[l]}
                      </button>
                    );
                  })}
                </div>
                <ToggleRow checked={showProblems} onChange={() => setShowProblems((v) => !v)} label="Показати проблеми" />
                <div style={{ height: 1, background: 'var(--sc-border)', margin: '0.5em 0' }} />
                <div style={{ fontSize: '0.72em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sc-muted)', marginBottom: '0.3em' }}>Зручності</div>
                <div style={grid2}>
                  {featureChips.map((f) => (
                    <ToggleRow key={f.key} checked={features.has(f.key)} onChange={() => toggleFeature(f.key)} label={f.label} />
                  ))}
                </div>
                <div style={{ height: 1, background: 'var(--sc-border)', margin: '0.5em 0' }} />
                <div style={{ fontSize: '0.72em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sc-muted)', marginBottom: '0.3em' }}>Категорії</div>
                <div style={grid2}>
                  {CATEGORIES.map((c) => (
                    <ToggleRow key={c} checked={enabled.has(c)} onChange={() => toggleCat(c)} label={categoryLabel[c]} />
                  ))}
                </div>
                <button type="button" className="sc-foc" onClick={() => { setLevelFilter(new Set()); setFeatures(new Set()); setShowProblems(false); setEnabled(new Set(CATEGORIES)); }} style={{ marginTop: '0.6em', background: 'none', border: 'none', color: 'var(--sc-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85em' }}>
                  Скинути фільтри
                </button>
              </div>
            </>
          )}
        </div>

        {/* Count (bottom-right) */}
        <span aria-live="polite" style={{ position: 'absolute', right: '0.8em', bottom: '0.8em', fontSize: '0.8em', fontWeight: 700, color: 'var(--sc-text)', background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '0.3em 0.7em', boxShadow: 'var(--sc-shadow-1)' }}>
          {status === 'ready' ? `${matching.length} місць` : '…'}
        </span>

        {/* Street segment panel */}
        {selectedSegment && !modalId && !dropped && (
          <StreetSegmentPanel
            segment={selectedSegment}
            onClose={() => setSelectedSegmentId(null)}
          />
        )}

        {/* Dropped-marker panel: address + route actions */}
        {dropped && !modalId && (
          <div
            role="dialog"
            aria-label="Мітка на мапі"
            className={`sc-map-panel${pickFromCb && !isDesktop ? ' sc-map-panel--hidden' : ''}`}
            style={{ padding: '1.2em 1.4em 2.5em' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '0.7em' }}>
              <MapPinIcon size={18} aria-hidden style={{ color: 'var(--sc-primary)', flexShrink: 0 }} />
              <strong style={{ flex: 1, minWidth: 0, fontSize: '1.05em' }}>Мітка на мапі</strong>
              <button type="button" className="sc-foc" aria-label="Закрити" onClick={clearDropped} style={panelClose}><X size={16} aria-hidden /></button>
            </div>
            <p style={{ margin: '0 0 1em', fontSize: '0.92em', lineHeight: 1.45, color: 'var(--sc-text)' }}>
              {dropped.address ?? 'Визначення адреси…'}
            </p>
            {routeDir === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6em' }}>
                <button type="button" className="sc-foc" onClick={() => setRouteDir('to')} style={panelPrimary}>Маршрут сюди</button>
                <button type="button" className="sc-foc" onClick={() => setRouteDir('from')} style={panelSecondary}>Маршрут звідси</button>
                <button
                  type="button" className="sc-foc"
                  onClick={() => router.push(`/contribute?lng=${dropped.lng}&lat=${dropped.lat}&address=${encodeURIComponent(dropped.address ?? '')}`)}
                  style={panelSecondary}
                >
                  Додати місце тут
                </button>
                <button
                  type="button" className="sc-foc"
                  onClick={() => router.push(`/contribute/segment?lng=${dropped.lng}&lat=${dropped.lat}`)}
                  style={panelSecondary}
                >
                  Додати шлях тут
                </button>
                <button type="button" className="sc-foc" onClick={() => router.push(`/problem/new?lng=${dropped.lng}&lat=${dropped.lat}&label=${encodeURIComponent(dropped.address ?? '')}`)} style={panelReport}>
                  Повідомити про проблему
                </button>
              </div>
            ) : (
              <>
                <button type="button" className="sc-foc" onClick={() => { setRouteDir(null); setRouteDisplay(null); setPickFromCb(null); }} style={panelBack}>← Змінити напрямок</button>
                <RouteTabContent
                  seedFrom={routeDir === 'from' ? markerSeed ?? undefined : undefined}
                  seedTo={routeDir === 'to' ? markerSeed ?? undefined : undefined}
                  onRequestMapPick={(cb) => setPickFromCb(() => cb)}
                  onCancelMapPick={() => setPickFromCb(null)}
                  onRouteDisplay={setRouteDisplay}
                />
              </>
            )}
          </div>
        )}

        {modalId && (
          <PointDetailModal
            id={modalId}
            hidden={Boolean(pickFromCb) && !isDesktop}
            onClose={() => { setModalId(null); setPickFromCb(null); setRouteDisplay(null); }}
            onRequestMapPick={(cb) => setPickFromCb(() => cb)}
            onCancelMapPick={() => setPickFromCb(null)}
            onRouteDisplay={setRouteDisplay}
          />
        )}
      </main>
    </div>
  );
}

function ToggleRow({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="sc-foc" onClick={onChange} style={{
      display: 'flex', alignItems: 'center', gap: '0.55em', width: '100%', minHeight: '2.4em', padding: '0 0.4em',
      background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.92em', color: 'var(--sc-text)', textAlign: 'left',
    }}>
      <span aria-hidden style={{ width: '1.3em', height: '1.3em', flexShrink: 0, borderRadius: '0.35em', display: 'grid', placeItems: 'center', border: `2px solid ${checked ? 'var(--sc-primary)' : 'var(--sc-border-strong)'}`, background: checked ? 'var(--sc-primary)' : 'transparent', color: 'var(--sc-on-primary)' }}>
        {checked ? <Check size={12} /> : null}
      </span>
      {label}
    </button>
  );
}

const searchWrap = { display: 'flex', alignItems: 'center', gap: '0.6em', minHeight: '2.9em', padding: '0 0.9em', background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.85em', boxShadow: 'var(--sc-shadow-2)' } as const;
const searchInput = { flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: '1em', color: 'var(--sc-text)', outline: 'none', minHeight: '2.6em' } as const;
const clearBtn = { border: 'none', background: 'none', color: 'var(--sc-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 } as const;
const results = { listStyle: 'none', margin: '0.45em 0 0', padding: '0.3em', position: 'absolute', left: 0, right: 0, top: '100%', background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.85em', boxShadow: 'var(--sc-shadow-2)', maxHeight: '60vh', overflowY: 'auto' } as const;
const resultHead = { padding: '0.5em 0.6em 0.2em', fontSize: '0.7em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sc-muted)' } as const;
const resultMuted = { padding: '0.7em 0.6em', color: 'var(--sc-muted)', fontSize: '0.9em' } as const;
const resultRow = { display: 'flex', alignItems: 'center', gap: '0.6em', width: '100%', textAlign: 'left', padding: '0.55em 0.6em', borderRadius: '0.6em', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--sc-text)' } as const;
const resultTitle = { display: 'block', fontWeight: 700, fontSize: '0.92em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
const resultSub = { display: 'block', fontSize: '0.78em', color: 'var(--sc-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
const filterTrigger = { position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.4em', minHeight: '2.6em', padding: '0 0.9em', borderRadius: '1.4em', border: 'var(--sc-bw) solid var(--sc-border-strong)', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9em', cursor: 'pointer', boxShadow: 'var(--sc-shadow-2)' } as const;
const filterBadge = { minWidth: '1.5em', height: '1.5em', borderRadius: '50%', background: 'var(--sc-primary)', color: 'var(--sc-on-primary)', display: 'grid', placeItems: 'center', fontSize: '0.7em', fontWeight: 800, padding: '0 0.3em' } as const;
const filterPanel = { position: 'absolute', right: 0, top: 'calc(100% + 0.5em)', zIndex: 6, width: 'min(92vw, 380px)', maxHeight: '70vh', overflowY: 'auto', background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.9em', boxShadow: 'var(--sc-shadow-2)', padding: '0.7em' } as const;
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0 0.6em' } as const;
const panelClose = { flexShrink: 0, width: '2.2em', height: '2.2em', borderRadius: '50%', cursor: 'pointer', border: 'var(--sc-bw) solid var(--sc-border)', background: 'var(--sc-surface)', color: 'var(--sc-text)', display: 'grid', placeItems: 'center' } as const;
const panelPrimary = { display: 'inline-grid', placeItems: 'center', minHeight: '2.9em', padding: '0 1.2em', borderRadius: '0.7em', fontWeight: 800, background: 'var(--sc-primary)', color: 'var(--sc-on-primary)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95em' } as const;
const panelSecondary = { display: 'inline-grid', placeItems: 'center', minHeight: '2.9em', padding: '0 1.2em', borderRadius: '0.7em', fontWeight: 800, background: 'var(--sc-surface)', color: 'var(--sc-primary)', border: 'var(--sc-bw) solid var(--sc-primary)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95em' } as const;
const panelReport = { display: 'inline-grid', placeItems: 'center', minHeight: '2.9em', padding: '0 1.2em', borderRadius: '0.7em', fontWeight: 800, background: 'var(--sc-surface)', color: 'var(--sc-bad)', border: 'var(--sc-bw) solid var(--sc-bad)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95em', width: '100%' } as const;
const panelBack = { background: 'none', border: 'none', color: 'var(--sc-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9em', padding: 0, marginBottom: '0.8em' } as const;
