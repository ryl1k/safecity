'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { PointSummary } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { Button, LoadingState, ErrorState } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { pointById } from '@/lib/points';
import { distanceLabel } from '@/lib/format';

const LVIV: [number, number] = [24.0316, 49.8419];
const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), { ssr: false });

interface Step { instruction: string; distance: number }

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
  const [speaking, setSpeaking] = useState(false);
  const stepsRef = useRef<Step[]>([]);
  stepsRef.current = steps;

  async function plan() {
    if (!to) {
      setStatus('error');
      return;
    }
    stopSpeech();
    setSpeaking(false);
    setStatus('loading');
    try {
      const point = await pointById(to);
      if (!point) {
        setStatus('error');
        return;
      }
      setDest(point);
      const start = await getStart();
      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: start, to: [point.lng, point.lat], profile: primary }),
      });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      const data = await res.json();
      setLine(data.coordinates);
      setSteps(data.steps);
      setSummary(data.summary);
      setFallback(Boolean(data.fallback));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    void plan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, primary]);

  // Always stop speech when leaving the page.
  useEffect(() => () => stopSpeech(), []);

  function toggleSpeak() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(stepsRef.current.map((s) => s.instruction).join('. '));
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
      <main style={{ flex: 1, maxWidth: 1000, width: '100%', margin: '0 auto', padding: '1.2em 1.25em 3em' }}>
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

        {status === 'ready' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1em', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 340px', height: 440, minWidth: 280 }}>
              <MapView points={[]} center={dest ? [dest.lng, dest.lat] : LVIV} onSelect={() => {}} line={line} />
            </div>
            <div style={{ flex: '1 1 300px', minWidth: 260, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em', marginBottom: '0.8em', flexWrap: 'wrap' }}>
                {summary ? (
                  <span style={{ fontWeight: 800 }}>
                    {distanceLabel(summary.distance)} · {Math.round(summary.duration / 60)} хв
                  </span>
                ) : null}
                <Button variant={speaking ? 'secondary' : 'accent'} onClick={toggleSpeak} style={{ marginLeft: 'auto' }}>
                  {speaking ? 'Зупинити' : 'Озвучити'}
                </Button>
              </div>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', overflowY: 'auto', maxHeight: '60vh' }}>
                {steps.map((s, i) => (
                  <li key={i} style={{ display: 'flex', gap: '0.7em', padding: '0.7em 0.9em', borderTop: i ? 'var(--sc-bw) solid var(--sc-border)' : 'none' }}>
                    <span aria-hidden style={{ width: '1.7em', height: '1.7em', flexShrink: 0, borderRadius: '50%', background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '0.8em' }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: '0.92em' }}>{s.instruction}</span>
                    <span style={{ color: 'var(--sc-muted)', fontSize: '0.8em', whiteSpace: 'nowrap' }}>{distanceLabel(s.distance)}</span>
                  </li>
                ))}
              </ol>
            </div>
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
