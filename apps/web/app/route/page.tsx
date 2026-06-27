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
import { pointById, pointsInBbox } from '@/lib/points';
import { problemsInBbox } from '@/lib/civic';
import { getCatalog } from '@/lib/catalog';
import { categoryLabel, distanceLabel } from '@/lib/format';

const LVIV: [number, number] = [24.0316, 49.8419];
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

// Small square avoidance polygon (~30 m) around a barrier, as a GeoJSON ring.
function avoidSquare(lng: number, lat: number): number[][][] {
  const d = 0.0002;
  return [[
    [lng - d, lat - d],
    [lng + d, lat - d],
    [lng + d, lat + d],
    [lng - d, lat + d],
    [lng - d, lat - d],
  ]];
}

function stopSpeech() {
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
}

function RouteInner() {
  const params = useSearchParams();
  const to = params.get('to');
  const { primary } = useProfile();

  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('loading');
  const [dest, setDest] = useState<PointSummary | null>(null);
  const [line, setLine] = useState<[number, number][]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [summary, setSummary] = useState<{ distance: number; duration: number } | null>(null);
  const [fallback, setFallback] = useState(false);
  const [avoided, setAvoided] = useState(0);
  const [nearby, setNearby] = useState<Nearby[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const stepsRef = useRef<Step[]>([]);
  stepsRef.current = steps;
  const nearbyRef = useRef<Nearby[]>([]);
  nearbyRef.current = nearby;

  async function plan() {
    if (!to) {
      setStatus('error');
      return;
    }
    stopSpeech();
    setSpeaking(false);
    setStatus('loading');
    setAvoided(0);
    setNearby([]);
    try {
      const point = await pointById(to);
      if (!point) {
        setStatus('error');
        return;
      }
      setDest(point);
      const start = await getStart();
      const dest: [number, number] = [point.lng, point.lat];

      // Live-barrier avoidance: confirmed/escalated problems in the start↔dest area.
      const box = {
        minLng: Math.min(start[0], dest[0]) - 0.003,
        minLat: Math.min(start[1], dest[1]) - 0.003,
        maxLng: Math.max(start[0], dest[0]) + 0.003,
        maxLat: Math.max(start[1], dest[1]) + 0.003,
      };
      let avoid: number[][][][] = [];
      try {
        const probs = await problemsInBbox(box.minLng, box.minLat, box.maxLng, box.maxLat);
        avoid = probs
          .filter((p) => p.status === 'confirmed' || p.status === 'escalated')
          .map((p) => avoidSquare(p.lng, p.lat));
      } catch {
        /* avoidance is best-effort */
      }

      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: start, to: dest, profile: primary, avoid }),
      });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      const data = await res.json();
      const coords: [number, number][] = data.coordinates ?? [];
      setLine(coords);
      setSteps(data.steps);
      setSummary(data.summary);
      setFallback(Boolean(data.fallback));
      setAvoided(data.avoided ?? 0);
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

  useEffect(() => {
    void plan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, primary]);

  useEffect(() => () => stopSpeech(), []);

  function toggleSpeak() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    const stepsText = stepsRef.current.map((s) => s.instruction).join('. ');
    const calloutsText = nearbyRef.current.length
      ? ` Поруч доступні місця: ${nearbyRef.current.map((n) => `${n.name} (${categoryLabel[n.category].toLowerCase()})`).join(', ')}.`
      : '';
    const u = new SpeechSynthesisUtterance(stepsText + calloutsText);
    u.lang = 'uk-UA';
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
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

        {status === 'loading' && <LoadingState label="Прокладання маршруту" />}
        {status === 'error' && <ErrorState title="Не вдалося прокласти маршрут" onRetry={() => void plan()} />}

        {status === 'ready' && fallback && (
          <p role="status" style={{ margin: '0 0 1em', padding: '0.7em 1em', borderRadius: '0.7em', background: 'var(--sc-warn-bg)', color: 'var(--sc-warn)', border: 'var(--sc-bw) solid var(--sc-warn-line)', fontSize: '0.85em', fontWeight: 700 }}>
            Пішохідний маршрут — детальних даних для крісла колісного на цьому відрізку бракує.
          </p>
        )}

        {status === 'ready' && avoided > 0 && (
          <p role="status" style={{ margin: '0 0 1em', padding: '0.7em 1em', borderRadius: '0.7em', background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)', border: 'var(--sc-bw) solid var(--sc-primary)', fontSize: '0.85em', fontWeight: 700 }}>
            Оминаємо {avoided} підтверджених бар’єр(и) на шляху.
          </p>
        )}

        {status === 'ready' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1em' }}>
            {/* Map on top, full width */}
            <div style={{ width: '100%', height: 'min(50vh, 420px)', minHeight: 280 }}>
              <MapView points={[]} center={dest ? [dest.lng, dest.lat] : LVIV} onSelect={() => {}} line={line} />
            </div>

            {/* Summary + audio, under the map */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em', flexWrap: 'wrap' }}>
              {summary ? (
                <span style={{ fontWeight: 800 }}>
                  {distanceLabel(summary.distance)} · {Math.round(summary.duration / 60)} хв
                </span>
              ) : null}
              <Button variant={speaking ? 'secondary' : 'accent'} onClick={toggleSpeak} style={{ marginLeft: 'auto' }}>
                {speaking ? 'Зупинити' : 'Озвучити'}
              </Button>
            </div>

            {/* Accessible points along the way */}
            {nearby.length > 0 && (
              <section style={{ background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '1em 1.2em' }}>
                <h2 style={{ margin: '0 0 0.5em', fontSize: '1em', fontWeight: 800 }}>Доступні місця поруч на маршруті</h2>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4em' }}>
                  {nearby.map((n) => (
                    <li key={n.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5em', fontSize: '0.9em' }}>
                      <span aria-hidden style={{ width: '0.7em', height: '0.7em', borderRadius: '50%', background: 'var(--sc-ok)', flexShrink: 0 }} />
                      <Link href={`/point/${n.id}`} className="sc-foc" style={{ color: 'var(--sc-text)', textDecoration: 'none', fontWeight: 700 }}>{n.name}</Link>
                      <span style={{ color: 'var(--sc-muted)' }}>· {categoryLabel[n.category]}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Steps */}
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', overflow: 'hidden' }}>
              {steps.map((s, i) => (
                <li key={i} style={{ display: 'flex', gap: '0.7em', padding: '0.7em 0.9em', borderTop: i ? 'var(--sc-bw) solid var(--sc-border)' : 'none' }}>
                  <span aria-hidden style={{ width: '1.7em', height: '1.7em', flexShrink: 0, borderRadius: '50%', background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '0.8em' }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: '0.92em' }}>{s.instruction}</span>
                  <span style={{ color: 'var(--sc-muted)', fontSize: '0.8em', whiteSpace: 'nowrap' }}>{distanceLabel(s.distance)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function getStart(): Promise<[number, number]> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(LVIV);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.longitude, pos.coords.latitude]),
      () => resolve(LVIV),
      { timeout: 4000 },
    );
  });
}

export default function RoutePage() {
  return (
    <Suspense fallback={<div style={{ padding: '2em' }}><LoadingState /></div>}>
      <RouteInner />
    </Suspense>
  );
}
