'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, List as ListIcon, Map as MapIconLucide, MapPin as MapPinIcon, Search, Volume2, Square, X } from 'lucide-react';
import type { AccessibilityFeature, Category, PointSummary, Rating } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { PointDetailModal } from '@/components/PointDetailModal';
import { ListRow, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { getCatalog } from '@/lib/catalog';
import { pointsNear, pointById, searchPointsByName, type PointHit } from '@/lib/points';
import { problemsInBbox, type ProblemMarker } from '@/lib/civic';
import { geocodePlaces, type GeoPlace } from '@/lib/geocode';
import { categoryLabel, distanceLabel, featureSummary } from '@/lib/format';
import { speak, stopSpeech } from '@/lib/tts';

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
  const [view, setView] = useState<'map' | 'list'>('map');
  const pickedView = useRef(false);

  const [onlyAccessible, setOnlyAccessible] = useState(false);
  const [enabled, setEnabled] = useState<Set<Category>>(new Set(CATEGORIES));
  const [showProblems, setShowProblems] = useState(false);
  const [problems, setProblems] = useState<ProblemMarker[]>([]);
  const [modalId, setModalId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lng: number; lat: number; nonce: number } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const lastBbox = useRef<Bbox | null>(null);
  const nonceRef = useRef(0);
  const bboxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [pointHits, setPointHits] = useState<PointHit[]>([]);
  const [placeHits, setPlaceHits] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  async function loadNear(lng: number, lat: number, radius: number) {
    try {
      const pts = await pointsNear(lng, lat, radius);
      setPoints(pts);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    void getCatalog().then(setCatalog).catch(() => setCatalog([]));
    void loadNear(LVIV[0], LVIV[1], 2500);
  }, []);

  useEffect(() => () => stopSpeech(), []);

  // Blind users get the audio-first list by default (unless they pick a view).
  useEffect(() => {
    if (!pickedView.current && primary === 'blind') setView('list');
  }, [primary]);

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

  // Debounced search.
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

  const rated = useMemo(
    () => points.map((p) => ({ point: p, rating: computeRating(p.features, catalog, p.category, primary) as Rating })),
    [points, catalog, primary],
  );
  const filtered = useMemo(
    () => rated.filter(({ point, rating }) => enabled.has(point.category) && (!onlyAccessible || rating === 'full')),
    [rated, enabled, onlyAccessible],
  );
  const markers = useMemo(
    () => filtered.map(({ point, rating }) => ({ id: point.id, name: point.name, lng: point.lng, lat: point.lat, category: point.category, rating })),
    [filtered],
  );

  function flyTo(lng: number, lat: number) {
    nonceRef.current += 1;
    setFocus({ lng, lat, nonce: nonceRef.current });
  }
  async function pickPoint(id: string) {
    setOpen(false); setQuery('');
    const p = await pointById(id).catch(() => null);
    if (p) flyTo(p.lng, p.lat);
    setModalId(id);
  }
  function pickPlace(place: GeoPlace) {
    setOpen(false); setQuery(place.label.split(',')[0] ?? '');
    pickedView.current = true; setView('map');
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
  function chooseView(v: 'map' | 'list') { pickedView.current = true; if (v !== 'list' && speaking) { stopSpeech(); setSpeaking(false); } setView(v); }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="map" />

      <main id="main-content" tabIndex={-1} style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <h1 className="sc-sr">Мапа доступних місць</h1>

        {status === 'error' ? (
          <div style={{ padding: '2em 1.25em' }}><ErrorState onRetry={() => void loadNear(LVIV[0], LVIV[1], 2500)} /></div>
        ) : view === 'map' ? (
          <ExploreMap points={markers} problems={problems} center={LVIV} onSelect={setModalId} onSelectProblem={(id) => router.push(`/problem/${id}`)} onMoveEnd={onMoveEnd} focus={focus} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '5.2em 0.9em 6.5em' }}>
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
              {status === 'loading' && <LoadingState />}
              {status === 'ready' && filtered.length === 0 && (
                <EmptyState title="Нічого не знайдено" message="Спробуйте змінити фільтри або область мапи." actionLabel="Скинути фільтри" onAction={() => { setOnlyAccessible(false); setEnabled(new Set(CATEGORIES)); }} />
              )}
              {status === 'ready' && filtered.length > 0 && (
                <>
                  <p className="sc-sr">Список доступних місць поруч, відсортований за відстанню.</p>
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
                </>
              )}
            </div>
          </div>
        )}

        {/* Floating search (top) */}
        {status !== 'error' && (
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
        )}

        {/* Floating controls (bottom): view toggle + filters */}
        {status !== 'error' && (
          <div style={{ position: 'absolute', left: '0.8em', right: '0.8em', bottom: '0.8em', display: 'flex', flexWrap: 'wrap', gap: '0.4em', alignItems: 'center', pointerEvents: 'none' }}>
            <div role="group" aria-label="Режим перегляду" style={{ display: 'inline-flex', borderRadius: '1.4em', overflow: 'hidden', border: 'var(--sc-bw) solid var(--sc-border-strong)', boxShadow: 'var(--sc-shadow-2)', pointerEvents: 'auto' }}>
              <ToggleBtn active={view === 'map'} onClick={() => chooseView('map')}><MapIconLucide size={15} aria-hidden /> Мапа</ToggleBtn>
              <ToggleBtn active={view === 'list'} onClick={() => chooseView('list')}><ListIcon size={15} aria-hidden /> Список</ToggleBtn>
            </div>
            <FilterChip pressed={onlyAccessible} onToggle={() => setOnlyAccessible((v) => !v)} accent>✓ Лише доступні</FilterChip>
            {view === 'map' && (
              <FilterChip pressed={showProblems} onToggle={() => setShowProblems((v) => !v)}><AlertTriangle size={14} aria-hidden /> Проблеми</FilterChip>
            )}
            {CATEGORIES.map((c) => (
              <FilterChip key={c} pressed={enabled.has(c)} onToggle={() => setEnabled((prev) => toggleCat(prev, c))}>{categoryLabel[c]}</FilterChip>
            ))}
            {view === 'list' && filtered.length > 0 && (
              <button type="button" className="sc-foc" onClick={toggleSpeak} aria-label={speaking ? 'Зупинити озвучення' : 'Озвучити місця поруч'} style={{ ...chipBase, pointerEvents: 'auto', border: 'var(--sc-bw) solid var(--sc-primary)', background: speaking ? 'var(--sc-primary)' : 'var(--sc-surface)', color: speaking ? 'var(--sc-on-primary)' : 'var(--sc-primary)' }}>
                {speaking ? <Square size={14} aria-hidden /> : <Volume2 size={14} aria-hidden />} {speaking ? 'Зупинити' : 'Озвучити'}
              </button>
            )}
            <span aria-live="polite" style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '0.8em', fontWeight: 700, color: 'var(--sc-text)', background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '0.2em 0.7em', boxShadow: 'var(--sc-shadow-1)', pointerEvents: 'auto' }}>
              {status === 'ready' ? `${filtered.length} місць` : '…'}
            </span>
          </div>
        )}
      </main>

      {modalId && <PointDetailModal id={modalId} onClose={() => setModalId(null)} />}
    </div>
  );
}

function toggleCat(set: Set<Category>, c: Category): Set<Category> {
  const next = new Set(set);
  if (next.has(c)) next.delete(c); else next.add(c);
  return next;
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="sc-foc" aria-pressed={active} onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35em', minHeight: '2.4em', padding: '0 0.9em',
      border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.85em', whiteSpace: 'nowrap',
      background: active ? 'var(--sc-primary)' : 'var(--sc-surface)', color: active ? 'var(--sc-on-primary)' : 'var(--sc-text)',
    }}>{children}</button>
  );
}

function FilterChip({ children, pressed, onToggle, accent }: { children: React.ReactNode; pressed: boolean; onToggle: () => void; accent?: boolean }) {
  return (
    <button type="button" className="sc-foc" aria-pressed={pressed} onClick={onToggle} style={{
      ...chipBase, pointerEvents: 'auto',
      border: `var(--sc-bw) solid ${pressed ? 'var(--sc-primary)' : 'var(--sc-border-strong)'}`,
      background: pressed ? (accent ? 'var(--sc-primary)' : 'var(--sc-primary-tint)') : 'var(--sc-surface)',
      color: pressed ? (accent ? 'var(--sc-on-primary)' : 'var(--sc-primary)') : 'var(--sc-text)',
    }}>{children}</button>
  );
}

const searchWrap = {
  display: 'flex', alignItems: 'center', gap: '0.6em', minHeight: '2.9em', padding: '0 0.9em',
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.85em', boxShadow: 'var(--sc-shadow-2)',
} as const;
const searchInput = { flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: '1em', color: 'var(--sc-text)', outline: 'none', minHeight: '2.6em' } as const;
const clearBtn = { border: 'none', background: 'none', color: 'var(--sc-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 } as const;

const results = {
  listStyle: 'none', margin: '0.45em 0 0', padding: '0.3em', position: 'absolute', left: 0, right: 0, top: '100%',
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.85em', boxShadow: 'var(--sc-shadow-2)', maxHeight: '60vh', overflowY: 'auto',
} as const;
const resultHead = { padding: '0.5em 0.6em 0.2em', fontSize: '0.7em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sc-muted)' } as const;
const resultMuted = { padding: '0.7em 0.6em', color: 'var(--sc-muted)', fontSize: '0.9em' } as const;
const resultRow = { display: 'flex', alignItems: 'center', gap: '0.6em', width: '100%', textAlign: 'left', padding: '0.55em 0.6em', borderRadius: '0.6em', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--sc-text)' } as const;
const resultTitle = { display: 'block', fontWeight: 700, fontSize: '0.92em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
const resultSub = { display: 'block', fontSize: '0.78em', color: 'var(--sc-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
const chipBase = {
  display: 'inline-flex', alignItems: 'center', gap: '0.35em', minHeight: '2.4em', padding: '0 0.8em', borderRadius: '1.4em',
  border: 'var(--sc-bw) solid var(--sc-border-strong)', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'inherit',
  fontWeight: 700, fontSize: '0.85em', cursor: 'pointer', boxShadow: 'var(--sc-shadow-2)', whiteSpace: 'nowrap',
} as const;
