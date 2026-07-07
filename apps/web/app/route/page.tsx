'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { AccessibilityFeature, PointSummary, Rating } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { Button, LoadingState, ErrorState } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { RoutePrefsControl } from '@/components/RoutePrefsControl';
import { loadRoutePrefs, saveRoutePrefs, routePrefsPayload, type RoutePrefs } from '@/lib/routePrefs';
import { pointById, pointsInBbox } from '@/lib/points';
import { api } from '@/lib/api';
import { getCatalog } from '@/lib/catalog';
import { categoryLabel, distanceLabel } from '@/lib/format';
import { speak, stopSpeech } from '@/lib/tts';
import { geocodePlaces } from '@/lib/geocode';
import { toast } from '@/lib/toast';
import { projectOntoRoute, stepCumulative, currentStepIndex, type LngLat } from '@/lib/nav';
import type { GeoPlace } from '@/lib/geocode';

import { loadCity } from '@/lib/cities';
const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), { ssr: false });

interface Step { instruction: string; distance: number }
interface Nearby { id: string; name: string; category: PointSummary['category'] }

// Rough metres between two lng/lat pairs (equirectangular — fine at city scale).
function metersBetween(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const x = dLng * Math.cos(lat);
  return Math.sqrt(x * x + dLat * dLat) * R;
}


function FromPicker({ onPick }: { onPick: (coords: [number, number], label: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (query.length < 3) { setResults([]); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    geocodePlaces(query, 5, ctrl.signal)
      .then(setResults)
      .catch(() => {})
      .finally(() => setSearching(false));
    return () => ctrl.abort();
  }, [query]);

  function useGPS() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPick([pos.coords.longitude, pos.coords.latitude], 'Моє місцезнаходження');
        setLocating(false);
      },
      () => { const c = loadCity(); onPick([c.lng, c.lat], `Центр міста ${c.name}`); setLocating(false); },
      { timeout: 6000 },
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: '2em auto 0' }}>
      <h2 style={{ margin: '0 0 0.6em', fontSize: '1.1em', fontWeight: 800 }}>Звідки прокласти маршрут?</h2>
      <div style={{ position: 'relative' }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Введіть адресу або місце…"
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '0.75em 1em', borderRadius: '0.7em',
            border: '2px solid var(--sc-border-strong)',
            background: 'var(--sc-surface)', color: 'var(--sc-text)',
            fontFamily: 'inherit', fontSize: '1em',
          }}
        />
        {searching && (
          <span style={{ position: 'absolute', right: '0.8em', top: '50%', transform: 'translateY(-50%)', color: 'var(--sc-muted)', fontSize: '0.8em' }}>…</span>
        )}
        {results.length > 0 && (
          <ul style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
            margin: '0.2em 0 0', padding: 0, listStyle: 'none',
            background: 'var(--sc-surface)', border: '1.5px solid var(--sc-border-strong)',
            borderRadius: '0.7em', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden',
          }}>
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onPick([r.lng, r.lat], r.label)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '0.65em 1em',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '0.9em', color: 'var(--sc-text)',
                    borderBottom: '1px solid var(--sc-border)',
                  }}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button
        variant="secondary"
        onClick={useGPS}
        disabled={locating}
        style={{ marginTop: '0.8em', width: '100%' }}
      >
        {locating ? 'Визначення…' : '📍 Використати моє місцезнаходження'}
      </Button>
    </div>
  );
}

function RouteInner() {
  const params = useSearchParams();
  const to = params.get('to');
  const { primary } = useProfile();

  const [fromCoords, setFromCoords] = useState<[number, number] | null>(null);
  const [fromLabel, setFromLabel] = useState<string>('');
  const [prefs, setPrefs] = useState<RoutePrefs>(() => loadRoutePrefs());
  const prefsRef = useRef<RoutePrefs>(prefs);
  prefsRef.current = prefs;
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [dest, setDest] = useState<PointSummary | null>(null);
  const [line, setLine] = useState<[number, number][]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [summary, setSummary] = useState<{ distance: number; duration: number } | null>(null);
  const [fallback, setFallback] = useState(false);
  const [avoided, setAvoided] = useState(0);
  const [crossesRed, setCrossesRed] = useState(0);
  const [routeSource, setRouteSource] = useState<string | null>(null);
  const [nearby, setNearby] = useState<Nearby[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const stepsRef = useRef<Step[]>([]);
  stepsRef.current = steps;
  const nearbyRef = useRef<Nearby[]>([]);
  nearbyRef.current = nearby;

  // ── Live navigation ────────────────────────────────────────────────────────
  const [navigating, setNavigating] = useState(false);
  const [userPos, setUserPos] = useState<LngLat | null>(null);
  const [navStep, setNavStep] = useState(0);
  const [distToNext, setDistToNext] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [offRoute, setOffRoute] = useState(0);
  const [arrived, setArrived] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lineRef = useRef<LngLat[]>([]);
  lineRef.current = line as LngLat[];
  const stepEndsRef = useRef<number[]>([]);
  const lastAnnouncedRef = useRef(-1);
  const arrivedRef = useRef(false);

  function pickFrom(coords: [number, number], label: string) {
    setFromCoords(coords);
    setFromLabel(label);
  }

  async function plan(start: [number, number]) {
    if (!to) {
      setStatus('error');
      return;
    }
    stopSpeech();
    setSpeaking(false);
    if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    setNavigating(false);
    setUserPos(null);
    setArrived(false);
    setStatus('loading');
    setAvoided(0);
    setCrossesRed(0);
    setNearby([]);
    try {
      const point = await pointById(to);
      if (!point) {
        setStatus('error');
        return;
      }
      setDest(point);
      const dest: [number, number] = [point.lng, point.lat];

      // The Go API builds avoid_polygons from confirmed problems server-side.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try {
        data = await api.post(
          '/route',
          { from: start, to: dest, profile: primary, ...routePrefsPayload(prefsRef.current) },
          { auth: false },
        );
      } catch {
        setStatus('error');
        return;
      }
      const coords: [number, number][] = data.coordinates ?? [];
      setLine(coords);
      setSteps(data.steps);
      setSummary(data.summary);
      setFallback(Boolean(data.fallback));
      setAvoided(data.avoided ?? 0);
      setCrossesRed(data.crossesRed ?? 0);
      setRouteSource(data.source ?? null);
      setStatus('ready');

      // Along-route accessible-points callouts (best-effort, after the route renders).
      void computeNearby(coords, point.id).then(setNearby).catch(() => setNearby([]));
    } catch {
      setStatus('error');
    }
  }

  async function computeNearby(coords: [number, number][], destId: string): Promise<Nearby[]> {
    if (coords.length < 2) return [];
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const [catalog, pts] = await Promise.all([
      getCatalog() as Promise<AccessibilityFeature[]>,
      pointsInBbox(Math.min(...lngs) - 0.001, Math.min(...lats) - 0.001, Math.max(...lngs) + 0.001, Math.max(...lats) + 0.001),
    ]);
    const sampled = coords.filter((_, i) => i % 4 === 0);
    return pts
      .filter((p) => p.id !== destId)
      .filter((p) => sampled.some((c) => metersBetween([p.lng, p.lat], c) < 80))
      .filter((p) => (computeRating(p.features, catalog, p.category, primary) as Rating) === 'full')
      .slice(0, 5)
      .map((p) => ({ id: p.id, name: p.name, category: p.category }));
  }

  // When user picks a start, immediately route
  useEffect(() => {
    if (fromCoords) void plan(fromCoords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCoords, to, primary]);

  useEffect(() => () => { stopSpeech(); if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current); }, []);

  // Live navigation: track position, advance the current step, announce turns.
  function updateProgress(pos: LngLat) {
    const ln = lineRef.current;
    if (ln.length < 2) return;
    const { along, off } = projectOntoRoute(pos, ln);
    setOffRoute(Math.round(off));
    const total = stepEndsRef.current[stepEndsRef.current.length - 1] ?? 0;
    setRemaining(Math.max(0, Math.round(total - along)));
    const cur = currentStepIndex(along, stepEndsRef.current);
    setNavStep(cur);
    setDistToNext(Math.max(0, Math.round((stepEndsRef.current[cur] ?? total) - along)));
    if (total - along <= 20) {
      if (!arrivedRef.current) { arrivedRef.current = true; setArrived(true); speak('Ви прибули до місця призначення.'); }
    } else {
      if (arrivedRef.current) { arrivedRef.current = false; setArrived(false); }
      if (cur !== lastAnnouncedRef.current) { lastAnnouncedRef.current = cur; speak(stepsRef.current[cur]?.instruction ?? ''); }
    }
  }

  function startNav() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast('Геолокація недоступна в цьому браузері', 'error');
      return;
    }
    if (lineRef.current.length < 2) return;
    stepEndsRef.current = stepCumulative(stepsRef.current);
    lastAnnouncedRef.current = -1;
    arrivedRef.current = false;
    setArrived(false);
    stopSpeech();
    setSpeaking(false);
    setNavigating(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => { const pos: LngLat = [p.coords.longitude, p.coords.latitude]; setUserPos(pos); updateProgress(pos); },
      () => { toast('Не вдалося отримати місцезнаходження. Дозвольте доступ до геолокації.', 'error'); },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 },
    );
  }

  function stopNav() {
    if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    setNavigating(false);
    setUserPos(null);
    setArrived(false);
    stopSpeech();
  }

  function onPrefs(p: RoutePrefs) {
    prefsRef.current = p; // so an immediate re-plan uses the new prefs
    setPrefs(p);
    saveRoutePrefs(p);
    if (fromCoords) void plan(fromCoords);
  }

  function toggleSpeak() {
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    const stepsText = stepsRef.current.map((s) => s.instruction).join('. ');
    const calloutsText = nearbyRef.current.length
      ? ` Поруч доступні місця: ${nearbyRef.current.map((n) => `${n.name} (${categoryLabel[n.category].toLowerCase()})`).join(', ')}.`
      : '';
    setSpeaking(true);
    speak(stepsText + calloutsText, { onend: () => setSpeaking(false), onerror: () => setSpeaking(false) });
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="map" />
      <main id="main-content" tabIndex={-1} style={{ flex: 1, width: '100%', maxWidth: 900, margin: '0 auto', padding: '1.2em 1.25em 3em' }}>
        <Link href={to ? `/point/${to}` : '/map'} className="sc-foc" style={{ color: 'var(--sc-primary)', fontWeight: 700, textDecoration: 'none', fontSize: '0.9em' }}>
          ‹ Назад
        </Link>
        <h1 style={{ margin: '0.5em 0 0.2em', fontSize: '1.6em', fontWeight: 800 }}>
          Маршрут{dest ? ` до «${dest.name}»` : ''}
        </h1>
        <p style={{ margin: '0 0 1em', color: 'var(--sc-muted)' }}>
          {primary === 'blind' ? 'Пішохідний маршрут з озвученням' : 'Маршрут без сходів'}
        </p>

        {/* Step 1: pick start */}
        {!fromCoords && <FromPicker onPick={pickFrom} />}

        {/* Step 2: routing in progress / result */}
        {fromCoords && (
          <>
            {/* "from" label + change link */}
            <p style={{ margin: '0 0 1em', fontSize: '0.88em', color: 'var(--sc-muted)' }}>
              Від: <strong style={{ color: 'var(--sc-text)' }}>{fromLabel}</strong>{' '}
              <button
                type="button"
                onClick={() => { setFromCoords(null); setStatus('idle'); }}
                style={{ background: 'none', border: 'none', color: 'var(--sc-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', padding: 0 }}
              >
                Змінити
              </button>
            </p>

            {primary !== 'blind' && (
              <div style={{ margin: '0 0 1em' }}>
                <RoutePrefsControl value={prefs} onChange={onPrefs} />
              </div>
            )}

            {status === 'loading' && <LoadingState label="Прокладання маршруту" />}
            {status === 'error' && <ErrorState title="Не вдалося прокласти маршрут" onRetry={() => void plan(fromCoords)} />}

            {status === 'ready' && fallback && (
              <p role="status" style={{ margin: '0 0 1em', padding: '0.7em 1em', borderRadius: '0.7em', background: 'var(--sc-warn-bg)', color: 'var(--sc-warn)', border: 'var(--sc-bw) solid var(--sc-warn-line)', fontSize: '0.85em', fontWeight: 700 }}>
                Пішохідний маршрут — детальних даних для крісла колісного на цьому відрізку бракує.
              </p>
            )}

            {status === 'ready' && routeSource && (
              <p style={{ margin: '0 0 1em', padding: '0.4em 0.8em', borderRadius: '0.5em', background: '#f1f5f9', color: '#475569', fontSize: '0.78em', fontFamily: 'monospace', fontWeight: 700 }}>
                🛠 source: {routeSource}
              </p>
            )}

            {status === 'ready' && avoided > 0 && (
              <p role="status" style={{ margin: '0 0 1em', padding: '0.7em 1em', borderRadius: '0.7em', background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)', border: 'var(--sc-bw) solid var(--sc-primary)', fontSize: '0.85em', fontWeight: 700 }}>
                Маршрут оминає {avoided} перешкод(и) поблизу.
              </p>
            )}

            {status === 'ready' && crossesRed > 0 && (
              <p role="status" style={{ margin: '0 0 1em', padding: '0.7em 1em', borderRadius: '0.7em', background: 'var(--sc-bad-bg)', color: 'var(--sc-bad)', border: 'var(--sc-bw) solid var(--sc-bad-line)', fontSize: '0.85em', fontWeight: 700 }}>
                Увага: маршрут проходить {crossesRed} недоступних ділянок — обхід відсутній.
              </p>
            )}

            {status === 'ready' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1em' }}>
                {/* Live navigation banner — the next maneuver, updating as you move. */}
                {navigating && (
                  <section aria-live="polite" style={{ background: arrived ? 'var(--sc-ok)' : 'var(--sc-primary)', color: 'var(--sc-on-primary)', borderRadius: '1em', padding: '1em 1.2em' }}>
                    {arrived ? (
                      <div style={{ fontSize: '1.15em', fontWeight: 800 }}>Ви прибули 🎉</div>
                    ) : (
                      <>
                        <div style={{ fontSize: '0.78em', fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Через {distanceLabel(distToNext)}
                        </div>
                        <div style={{ fontSize: '1.2em', fontWeight: 800, marginTop: '0.15em', lineHeight: 1.2 }}>
                          {steps[navStep]?.instruction ?? ''}
                        </div>
                        <div style={{ fontSize: '0.82em', opacity: 0.85, marginTop: '0.4em' }}>
                          Залишилось {distanceLabel(remaining)}
                          {offRoute > 40 && <span> · ви відхилились від маршруту ({distanceLabel(offRoute)})</span>}
                        </div>
                      </>
                    )}
                  </section>
                )}

                <div style={{ width: '100%', height: navigating ? 'min(60vh, 520px)' : 'min(50vh, 420px)', minHeight: 280 }}>
                  <MapView
                    points={[]}
                    center={userPos ?? (dest ? [dest.lng, dest.lat] : [loadCity().lng, loadCity().lat])}
                    onSelect={() => {}}
                    line={line}
                    connectors={line.length >= 2 ? [
                      ...(fromCoords ? [[fromCoords, line[0] as [number,number]]] as [[number,number],[number,number]][] : []),
                      ...(dest ? [[line[line.length - 1] as [number,number], [dest.lng, dest.lat] as [number,number]]] as [[number,number],[number,number]][] : []),
                    ] : []}
                    routeEndpoints={{
                      start: fromCoords ?? undefined,
                      end: dest ? [dest.lng, dest.lat] : undefined,
                    }}
                    userPos={userPos}
                    follow={navigating}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em', flexWrap: 'wrap' }}>
                  {summary ? (
                    <span style={{ fontWeight: 800 }}>
                      {distanceLabel(summary.distance)} · {Math.round(summary.duration / 60)} хв
                    </span>
                  ) : null}
                  {navigating ? (
                    <Button variant="danger" onClick={stopNav} style={{ marginLeft: 'auto' }}>Завершити</Button>
                  ) : (
                    <>
                      {steps.length > 0 && <Button onClick={startNav} style={{ marginLeft: 'auto' }}>Розпочати навігацію</Button>}
                      <Button variant={speaking ? 'secondary' : 'accent'} onClick={toggleSpeak} style={steps.length > 0 ? undefined : { marginLeft: 'auto' }}>
                        {speaking ? 'Зупинити' : 'Озвучити'}
                      </Button>
                    </>
                  )}
                </div>

                {nearby.length > 0 && (
                  <section style={{ background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '1em 1.2em' }}>
                    <h2 style={{ margin: '0 0 0.5em', fontSize: '1em', fontWeight: 800 }}>Доступні місця поруч на маршруті</h2>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4em' }}>
                      {nearby.map((n) => (
                        <li key={n.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap', fontSize: '0.9em' }}>
                          <span aria-hidden style={{ width: '0.7em', height: '0.7em', borderRadius: '50%', background: 'var(--sc-ok)', flexShrink: 0 }} />
                          <Link href={`/point/${n.id}`} className="sc-foc" style={{ color: 'var(--sc-primary)', textDecoration: 'underline', fontWeight: 700 }}>{n.name}</Link>
                          <span style={{ color: 'var(--sc-muted)' }}>· {categoryLabel[n.category]}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <ol style={{ listStyle: 'none', margin: 0, padding: 0, background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', overflow: 'hidden' }}>
                  {steps.map((s, i) => {
                    const active = navigating && i === navStep;
                    const done = navigating && i < navStep;
                    return (
                      <li key={i} style={{ display: 'flex', gap: '0.7em', padding: '0.7em 0.9em', borderTop: i ? 'var(--sc-bw) solid var(--sc-border)' : 'none', background: active ? 'var(--sc-primary-tint)' : 'transparent', opacity: done ? 0.5 : 1 }}>
                        <span aria-hidden style={{ width: '1.7em', height: '1.7em', flexShrink: 0, borderRadius: '50%', background: active ? 'var(--sc-primary)' : 'var(--sc-primary-tint)', color: active ? 'var(--sc-on-primary)' : 'var(--sc-primary)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '0.8em' }}>{i + 1}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: '0.92em', fontWeight: active ? 700 : 400 }}>{s.instruction}</span>
                        <span style={{ color: 'var(--sc-muted)', fontSize: '0.8em', whiteSpace: 'nowrap', flexShrink: 0 }}>{distanceLabel(s.distance)}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default function RoutePage() {
  return (
    <Suspense fallback={<div style={{ padding: '2em' }}><LoadingState /></div>}>
      <RouteInner />
    </Suspense>
  );
}
