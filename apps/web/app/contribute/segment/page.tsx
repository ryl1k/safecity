'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { SegmentPicker } from '@/components/SegmentPicker';
import { Button, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { submitSegment } from '@/lib/segments';
import { splitByElevation, type ElevSegment } from '@/lib/elevation';

const SURFACE_OPTIONS = [
  { value: '', label: 'Невідомо' },
  { value: 'asphalt', label: 'Асфальт' },
  { value: 'paving_stones', label: 'Тротуарна плитка' },
  { value: 'cobblestone', label: 'Бруківка' },
  { value: 'concrete', label: 'Бетон' },
  { value: 'gravel', label: 'Гравій' },
];

function BoolToggle({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8em', padding: '0.45em 0' }}>
      <span style={{ fontSize: '0.9em', fontWeight: 600 }}>{label}</span>
      <div style={{ display: 'flex', gap: '0.35em' }}>
        {([true, false, null] as const).map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            style={{
              minWidth: '2.8em', minHeight: '2.2em', padding: '0 0.6em', borderRadius: '0.5em', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.82em', fontWeight: 700,
              border: `var(--sc-bw) solid ${value === v ? 'var(--sc-primary)' : 'var(--sc-border-strong)'}`,
              background: value === v ? 'var(--sc-primary)' : 'var(--sc-surface)',
              color: value === v ? 'var(--sc-on-primary)' : 'var(--sc-text)',
            }}
          >
            {v === true ? 'Так' : v === false ? 'Ні' : '?'}
          </button>
        ))}
      </div>
    </div>
  );
}

function gradeLabel(pct: number): string {
  const abs = Math.abs(pct);
  const dir = pct >= 0 ? '↑' : '↓';
  if (abs < 2) return '→ рівно';
  if (abs < 5) return `${dir} ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% (пологий)`;
  if (abs < 8) return `${dir} ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% (середній)`;
  return `${dir} ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% (крутий)`;
}

function gradeColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 2) return 'var(--sc-good)';
  if (abs < 5) return '#ca8a04'; // amber
  return 'var(--sc-bad)';
}

export default function ContributeSegmentPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [initialCenter, setInitialCenter] = useState<[number, number] | null>(null);

  const [streetName, setStreetName] = useState('');
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);
  const [routedCoords, setRoutedCoords] = useState<[number, number][]>([]);

  // Elevation-split sub-segments — one DB row per entry.
  const [elevSegments, setElevSegments] = useState<ElevSegment[]>([]);
  const [elevStatus, setElevStatus] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle');

  const [surfaceType, setSurfaceType] = useState('');
  const [sidewalkWidthM, setSidewalkWidthM] = useState('');
  const [hasTactilePaving, setHasTactilePaving] = useState<boolean | null>(null);
  const [isStepFree, setIsStepFree] = useState<boolean | null>(null);
  const [hasCurbCuts, setHasCurbCuts] = useState<boolean | null>(null);
  const [hasRamp, setHasRamp] = useState<boolean | null>(null);
  const [lit, setLit] = useState<boolean | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Tracks which routed path the current elevation fetch is for, so stale
  // responses (from a previous route) are discarded when the user moves a waypoint.
  const elevCoordsRef = useRef<[number, number][]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lng = parseFloat(params.get('lng') ?? '');
    const lat = parseFloat(params.get('lat') ?? '');
    if (!isNaN(lng) && !isNaN(lat)) setInitialCenter([lng, lat]);

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace('/auth?next=/contribute/segment');
        return;
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Called by SegmentPicker after OSRM snaps the path.
  async function handleRouteChange(coords: [number, number][]) {
    setRoutedCoords(coords);
    setElevSegments([]);

    if (coords.length < 2) {
      setElevStatus('idle');
      return;
    }

    setElevStatus('loading');
    elevCoordsRef.current = coords;

    const segs = await splitByElevation(coords);

    // Discard if the route changed while we were fetching.
    if (elevCoordsRef.current !== coords) return;

    if (segs.length === 0) {
      setElevStatus('failed');
    } else {
      setElevSegments(segs);
      setElevStatus('done');
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (waypoints.length < 2) { setError('Позначте хоча б дві точки на карті'); return; }
    setError(null);
    setBusy(true);

    const common = {
      streetName,
      surfaceType: surfaceType || undefined,
      sidewalkWidthM: sidewalkWidthM ? parseFloat(sidewalkWidthM) : null,
      hasTactilePaving,
      isStepFree,
      hasCurbCuts,
      hasRamp,
      lit,
    };

    try {
      if (elevSegments.length > 0) {
        // Submit one DB row per elevation-split sub-segment.
        for (const seg of elevSegments) {
          await submitSegment({ ...common, coords: seg.coords, inclinePercent: seg.inclinePercent });
        }
      } else {
        // Elevation split failed or is still loading — submit the full routed path
        // (or raw waypoints as last resort) with no incline value.
        const coords = routedCoords.length >= 2 ? routedCoords : waypoints;
        await submitSegment({ ...common, coords, inclinePercent: null });
      }
      router.push('/map');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не вдалося зберегти шлях');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  const canSubmit = !busy && streetName.trim().length > 0 && waypoints.length >= 2 && elevStatus !== 'loading';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="map" />
      <main id="main-content" tabIndex={-1} style={{ flex: 1, width: '100%', maxWidth: 'min(100%, 640px)', margin: '0 auto', padding: '1.6em 1.25em 4em' }}>
        <h1 style={{ margin: '0 0 0.2em', fontSize: '1.7em', fontWeight: 800 }}>Додати шлях</h1>
        <p style={{ margin: '0 0 1.4em', color: 'var(--sc-muted)', fontSize: '0.92em' }}>
          Натисніть на карті, щоб позначити початок і кінець пішохідного шляху. Можна додати кілька точок.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1em' }}>
          <Field label="Назва вулиці" required value={streetName} onChange={(e) => setStreetName(e.target.value)} placeholder="напр. Вулиця Городоцька" />

          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9em', marginBottom: '0.5em' }}>Маршрут на карті</div>
            <SegmentPicker
              value={waypoints}
              onChange={setWaypoints}
              onRouteChange={handleRouteChange}
              elevSegments={elevSegments}
              initialCenter={initialCenter}
            />
          </div>

          {/* Elevation analysis result */}
          {elevStatus === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', color: 'var(--sc-primary)', fontSize: '0.88em', fontWeight: 700 }}>
              <span aria-hidden style={{ display: 'inline-block', width: '1em', height: '1em', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Аналізуємо профіль висот…
            </div>
          )}

          {elevStatus === 'done' && elevSegments.length > 0 && (
            <div style={{ background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.9em', padding: '0.8em 1em' }}>
              <div style={{ fontSize: '0.82em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sc-muted)', marginBottom: '0.6em' }}>
                Ділянки за нахилом ({elevSegments.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35em' }}>
                {elevSegments.map((seg, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5em' }}>
                    <span style={{ fontSize: '0.82em', color: 'var(--sc-muted)' }}>Ділянка {i + 1}</span>
                    <span style={{ fontSize: '0.85em', fontWeight: 700, color: gradeColor(seg.inclinePercent) }}>
                      {gradeLabel(seg.inclinePercent)}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ margin: '0.6em 0 0', fontSize: '0.78em', color: 'var(--sc-muted)' }}>
                Кожна ділянка буде збережена як окремий сегмент з власним нахилом.
              </p>
            </div>
          )}

          {elevStatus === 'failed' && (
            <p style={{ fontSize: '0.82em', color: 'var(--sc-muted)', margin: 0 }}>
              Не вдалося отримати дані висот — шлях буде збережено без нахилу.
            </p>
          )}

          <Field
            label="Ширина тротуару (м)"
            value={sidewalkWidthM}
            onChange={(e) => setSidewalkWidthM(e.target.value)}
            placeholder="напр. 1.5"
            type="number"
          />

          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9em', marginBottom: '0.4em' }}>Покриття</label>
            <select
              className="sc-foc"
              value={surfaceType}
              onChange={(e) => setSurfaceType(e.target.value)}
              style={{ width: '100%', padding: '0.7em 0.9em', borderRadius: '0.7em', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'inherit', fontSize: '1em', border: 'var(--sc-bw) solid var(--sc-border-strong)' }}
            >
              {SURFACE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <fieldset style={{ border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '0.8em 1em' }}>
            <legend style={{ fontWeight: 700, fontSize: '0.9em', padding: '0 0.4em' }}>Доступність</legend>
            <BoolToggle label="Без сходинок" value={isStepFree} onChange={setIsStepFree} />
            <BoolToggle label="Тактильне покриття" value={hasTactilePaving} onChange={setHasTactilePaving} />
            <BoolToggle label="Знижений бордюр" value={hasCurbCuts} onChange={setHasCurbCuts} />
            <BoolToggle label="Пандус" value={hasRamp} onChange={setHasRamp} />
            <BoolToggle label="Освітлення" value={lit} onChange={setLit} />
          </fieldset>

          {error && <div role="alert" style={{ color: 'var(--sc-bad)', fontWeight: 700, fontSize: '0.85em' }}>{error}</div>}

          <Button type="submit" disabled={!canSubmit} block>
            {busy
              ? 'Збереження…'
              : elevStatus === 'loading'
              ? 'Зачекайте — аналіз висот…'
              : elevSegments.length > 1
              ? `Надіслати ${elevSegments.length} ділянки на перевірку`
              : 'Надіслати на перевірку'}
          </Button>
        </form>
      </main>
      <Footer />
    </div>
  );
}
