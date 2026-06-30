'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal, Check, MapPin as MapPinIcon, Search, X } from 'lucide-react';
import type { AccessibilityFeature, Category, PointSummary } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { PointDetailModal } from '@/components/PointDetailModal';
import { LoadingState } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { getCatalog } from '@/lib/catalog';
import { pointsNear, pointById, searchPointsByName, type PointHit } from '@/lib/points';
import { problemsInBbox, type ProblemMarker } from '@/lib/civic';
import { geocodePlaces, type GeoPlace } from '@/lib/geocode';
import { isAccessible, MOBILITY_FILTERS, suggestFilters } from '@/lib/filters';
import { categoryLabel } from '@/lib/format';

const LVIV: [number, number] = [24.0316, 49.8419];
const CATEGORIES: Category[] = ['venue', 'transit', 'crossing', 'toilet', 'parking'];

const ExploreMap = dynamic(() => import('@/components/ExploreMap').then((m) => m.ExploreMap), { ssr: false });

interface Bbox { minLng: number; minLat: number; maxLng: number; maxLat: number }

function metersBetween(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const x = dLng * Math.cos(lat);
  return Math.sqrt(x * x + dLat * dLat) * R;
}

export default function MapPage() {
  const { primary } = useProfile();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [showInaccessible, setShowInaccessible] = useState(false);
  const [features, setFeatures] = useState<Set<string>>(new Set());
  const [enabled, setEnabled] = useState<Set<Category>>(new Set(CATEGORIES));
  const [showProblems, setShowProblems] = useState(false);
  const [problems, setProblems] = useState<ProblemMarker[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modalId, setModalId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lng: number; lat: number; nonce: number } | null>(null);
  const lastBbox = useRef<Bbox | null>(null);
  const nonceRef = useRef(0);
  const bboxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [pointHits, setPointHits] = useState<PointHit[]>([]);
  const [placeHits, setPlaceHits] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  async function loadNear(lng: number, lat: number, radius: number) {
    try {
      setPoints(await pointsNear(lng, lat, radius));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    void getCatalog().then(setCatalog).catch(() => setCatalog([]));
    void loadNear(LVIV[0], LVIV[1], 2500);
  }, []);

  function onMoveEnd(b: Bbox) {
    lastBbox.current = b;
    const center: [number, number] = [(b.minLng + b.maxLng) / 2, (b.minLat + b.maxLat) / 2];
    const radius = Math.min(9000, Math.max(800, metersBetween(center, [b.maxLng, b.maxLat])));
    if (bboxTimer.current) clearTimeout(bboxTimer.current);
    bboxTimer.current = setTimeout(() => {
      void loadNear(center[0], center[1], radius);
      if (showProblems) problemsInBbox(b.minLng, b.minLat, b.maxLng, b.maxLat).then(setProblems).catch(() => {});
    }, 250);
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

  const markers = useMemo(() => {
    const feats = MOBILITY_FILTERS.filter((f) => features.has(f.id));
    return points
      .filter((p) => enabled.has(p.category))
      .filter((p) => {
        // Feature chips act as the accessibility filter; otherwise default hides
        // non-accessible points unless "show inaccessible" is on.
        if (feats.length) return feats.every((f) => f.keys.some((k) => p.features[k] === 'yes'));
        return showInaccessible || isAccessible(p, catalog, primary);
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        lng: p.lng,
        lat: p.lat,
        category: p.category,
        accessible: isAccessible(p, catalog, primary),
      }));
  }, [points, enabled, features, showInaccessible, catalog, primary]);

  function flyTo(lng: number, lat: number) { nonceRef.current += 1; setFocus({ lng, lat, nonce: nonceRef.current }); }
  async function pickPoint(id: string) { setOpen(false); setQuery(''); const p = await pointById(id).catch(() => null); if (p) flyTo(p.lng, p.lat); setModalId(id); }
  function pickPlace(place: GeoPlace) { setOpen(false); setQuery(place.label.split(',')[0] ?? ''); flyTo(place.lng, place.lat); }

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
  const filterSugs = suggestFilters(query);

  function toggleCat(c: Category) { setEnabled((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; }); }
  function toggleFeature(id: string) { setFeatures((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  const activeFilters = (showInaccessible ? 1 : 0) + features.size + (showProblems ? 1 : 0) + (CATEGORIES.length - enabled.size);

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="map" />
      <main id="main-content" tabIndex={-1} style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <h1 className="sc-sr">Мапа доступних місць</h1>

        {status === 'error' ? (
          <div style={{ padding: '2em 1.25em' }}><LoadingState label="Повторне завантаження…" /></div>
        ) : (
          <ExploreMap points={markers} problems={problems} center={LVIV} onSelect={setModalId} onSelectProblem={(id) => router.push(`/problem/${id}`)} onMoveEnd={onMoveEnd} focus={focus} />
        )}

        {/* Floating search (top) */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '0.8em', display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 560, pointerEvents: 'auto' }}>
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
                      <li
                        key={`fc-${c}`}
                        role="option"
                        aria-selected={false}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setEnabled(new Set([c])); setOpen(false); setQuery(''); }}
                        style={resultRow}
                      >
                        <SlidersHorizontal size={16} aria-hidden style={{ color: 'var(--sc-primary)', flexShrink: 0 }} />
                        <span style={{ minWidth: 0 }}>
                          <span style={resultTitle}>{categoryLabel[c]}</span>
                          <span style={resultSub}>Лише ця категорія</span>
                        </span>
                      </li>
                    ))}
                    {filterSugs.features.map((f) => (
                      <li
                        key={`ff-${f.id}`}
                        role="option"
                        aria-selected={false}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { toggleFeature(f.id); setOpen(false); setQuery(''); }}
                        style={resultRow}
                      >
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
                {pointHits.map((p, i) => (
                  <li key={p.id} id={`map-opt-${i}`} role="option" aria-selected={activeIndex === i} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActiveIndex(i)} onClick={() => void pickPoint(p.id)} style={{ ...resultRow, background: activeIndex === i ? 'var(--sc-primary-tint)' : 'transparent' }}>
                    <MapPinIcon size={16} aria-hidden style={{ color: 'var(--sc-primary)', flexShrink: 0 }} />
                    <span style={{ minWidth: 0 }}><span style={resultTitle}>{p.name}</span><span style={resultSub}>{categoryLabel[p.category]}{p.address ? ` · ${p.address}` : ''}</span></span>
                  </li>
                ))}
                {placeHits.length > 0 && <li style={resultHead} aria-hidden>Адреси та місця</li>}
                {placeHits.map((pl, j) => { const idx = placeBase + j; return (
                  <li key={pl.id} id={`map-opt-${idx}`} role="option" aria-selected={activeIndex === idx} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActiveIndex(idx)} onClick={() => pickPlace(pl)} style={{ ...resultRow, background: activeIndex === idx ? 'var(--sc-primary-tint)' : 'transparent' }}>
                    <Search size={16} aria-hidden style={{ color: 'var(--sc-muted)', flexShrink: 0 }} />
                    <span style={{ minWidth: 0 }}><span style={resultTitle}>{pl.label.split(',')[0]}</span><span style={resultSub}>{pl.label.split(',').slice(1).join(',').trim()}</span></span>
                  </li>
                ); })}
              </ul>
            )}
          </div>
        </div>

        {/* Filters popover (bottom-left) — scales to any number of categories */}
        <div style={{ position: 'absolute', left: '0.8em', bottom: '0.8em' }}>
          <button
            type="button" className="sc-foc" aria-haspopup="dialog" aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)} style={filterTrigger}
          >
            <SlidersHorizontal size={16} aria-hidden /> Фільтри
            {activeFilters > 0 && <span aria-label={`${activeFilters} активних`} style={filterBadge}>{activeFilters}</span>}
          </button>
          {filtersOpen && (
            <>
              <div onClick={() => setFiltersOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 5 }} aria-hidden />
              <div role="dialog" aria-label="Фільтри мапи" style={filterPanel}>
                <ToggleRow checked={showInaccessible} onChange={() => setShowInaccessible((v) => !v)} label="Показати недоступні" />
                <ToggleRow checked={showProblems} onChange={() => setShowProblems((v) => !v)} label="Показати проблеми" />
                <div style={{ height: 1, background: 'var(--sc-border)', margin: '0.5em 0' }} />
                <div style={{ fontSize: '0.72em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sc-muted)', marginBottom: '0.3em' }}>Зручності</div>
                {MOBILITY_FILTERS.map((f) => (
                  <ToggleRow key={f.id} checked={features.has(f.id)} onChange={() => toggleFeature(f.id)} label={f.label} />
                ))}
                <div style={{ height: 1, background: 'var(--sc-border)', margin: '0.5em 0' }} />
                <div style={{ fontSize: '0.72em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sc-muted)', marginBottom: '0.3em' }}>Категорії</div>
                {CATEGORIES.map((c) => (
                  <ToggleRow key={c} checked={enabled.has(c)} onChange={() => toggleCat(c)} label={categoryLabel[c]} />
                ))}
                <button type="button" className="sc-foc" onClick={() => { setShowInaccessible(false); setFeatures(new Set()); setShowProblems(false); setEnabled(new Set(CATEGORIES)); }} style={{ marginTop: '0.6em', background: 'none', border: 'none', color: 'var(--sc-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85em' }}>
                  Скинути фільтри
                </button>
              </div>
            </>
          )}
        </div>

        {/* Count (bottom-right) */}
        <span aria-live="polite" style={{ position: 'absolute', right: '0.8em', bottom: '0.8em', fontSize: '0.8em', fontWeight: 700, color: 'var(--sc-text)', background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '0.3em 0.7em', boxShadow: 'var(--sc-shadow-1)' }}>
          {status === 'ready' ? `${markers.length} місць` : '…'}
        </span>
      </main>

      {modalId && <PointDetailModal id={modalId} onClose={() => setModalId(null)} />}
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
const filterPanel = { position: 'absolute', left: 0, bottom: 'calc(100% + 0.5em)', zIndex: 6, width: 'min(80vw, 240px)', maxHeight: '60vh', overflowY: 'auto', background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.9em', boxShadow: 'var(--sc-shadow-2)', padding: '0.7em' } as const;
