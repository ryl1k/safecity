'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { PointSummary } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { Button, LoadingState, ErrorState } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { pointById } from '@/lib/points';
import { distanceLabel } from '@/lib/format';

const LVIV: [number, number] = [24.0316, 49.8419];
const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), { ssr: false });

interface Step { instruction: string; distance: number }

function RouteInner() {
  const params = useSearchParams();
  const to = params.get('to');
  const { primary } = useProfile();

  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('loading');
  const [dest, setDest] = useState<PointSummary | null>(null);
  const [line, setLine] = useState<[number, number][]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [summary, setSummary] = useState<{ distance: number; duration: number } | null>(null);

  async function plan() {
    if (!to) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    try {
      const point = await pointById(to);
      if (!point) {
        setStatus('error');
        return;
      }
      setDest(point);
      // Start from device location if allowed, else Lviv centre.
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
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    void plan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, primary]);

  function speak() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(steps.map((s) => s.instruction).join('. '));
    u.lang = 'uk-UA';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <AppHeader active="map" />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '1.2em 1.25em 4em' }}>
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

        {status === 'ready' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: '1em', alignItems: 'start' }}>
            <div style={{ height: 440 }}>
              <MapView points={[]} center={dest ? [dest.lng, dest.lat] : LVIV} onSelect={() => {}} line={line} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em', marginBottom: '0.8em', flexWrap: 'wrap' }}>
                {summary ? (
                  <span style={{ fontWeight: 800 }}>
                    {distanceLabel(summary.distance)} · {Math.round(summary.duration / 60)} хв
                  </span>
                ) : null}
                <Button variant="accent" onClick={speak} style={{ marginLeft: 'auto' }}>Озвучити</Button>
              </div>
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
          </div>
        )}
      </main>
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
