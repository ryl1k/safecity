'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Footprints, ArrowLeft, ArrowRight } from 'lucide-react';
import type { AccessibilityFeature, Category, FeatureValue } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { LocationPicker } from '@/components/LocationPicker';
import { SegmentPicker } from '@/components/SegmentPicker';
import { PhotoInput } from '@/components/PhotoInput';
import { Button, Field } from '@/components/ui';
import { getCatalog } from '@/lib/catalog';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { uploadPhotos } from '@/lib/storage';
import { categoryLabel } from '@/lib/format';
import { loadCity } from '@/lib/cities';
import { submitSegment } from '@/lib/segments';
import { splitByElevation, type ElevSegment } from '@/lib/elevation';
import { reverseGeocode } from '@/lib/geocode';

type Kind = 'point' | 'pathway';

const CATEGORIES: Category[] = ['venue', 'transit', 'crossing', 'toilet', 'parking'];
const VAL_OPTS: { value: FeatureValue; label: string }[] = [
  { value: 'yes', label: 'Так' },
  { value: 'no', label: 'Ні' },
  { value: 'unknown', label: '?' },
];
const SURFACE_OPTIONS = [
  { value: '', label: 'Невідомо' },
  { value: 'asphalt', label: 'Асфальт' },
  { value: 'paving_stones', label: 'Тротуарна плитка' },
  { value: 'cobblestone', label: 'Бруківка' },
  { value: 'concrete', label: 'Бетон' },
  { value: 'gravel', label: 'Гравій' },
];
const STEPS = ['Тип', 'Деталі', 'Локація', 'Доступність'];

// yes / no / unknown selector (points) and true / false / null (pathways).
function TriToggle<T>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.35em' }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            minWidth: '2.8em', minHeight: '2.2em', padding: '0 0.6em', borderRadius: '0.5em', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '0.82em', fontWeight: 700,
            border: `var(--sc-bw) solid ${value === o.value ? 'var(--sc-primary)' : 'var(--sc-border-strong)'}`,
            background: value === o.value ? 'var(--sc-primary)' : 'var(--sc-surface)',
            color: value === o.value ? 'var(--sc-on-primary)' : 'var(--sc-text)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const BOOL_OPTS: { value: boolean | null; label: string }[] = [
  { value: true, label: 'Так' },
  { value: false, label: 'Ні' },
  { value: null, label: '?' },
];

function Row({ label, star, children }: { label: string; star?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8em', padding: '0.5em 0', flexWrap: 'wrap' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: '0.9em', fontWeight: 600 }}>
        {label}{star ? <span style={{ color: 'var(--sc-accent)' }}> ★</span> : null}
      </span>
      {children}
    </div>
  );
}

function gradeLabel(pct: number): string {
  const abs = Math.abs(pct);
  const dir = pct >= 0 ? '↑' : '↓';
  if (abs < 2) return '→ рівно';
  return `${dir} ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% (${abs < 5 ? 'пологий' : abs < 8 ? 'середній' : 'крутий'})`;
}
function gradeColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 2) return 'var(--sc-ok)';
  if (abs < 5) return '#ca8a04';
  return 'var(--sc-bad)';
}

export default function ContributePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);

  const [kind, setKind] = useState<Kind | null>(null);
  const [step, setStep] = useState(1); // 1 Тип · 2 Деталі · 3 Локація · 4 Доступність

  // ── shared / point ──────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('venue');
  const [loc, setLoc] = useState<[number, number] | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [values, setValues] = useState<Record<string, FeatureValue>>({});

  // ── pathway ─────────────────────────────────────────────────────────────────
  const [initialCenter, setInitialCenter] = useState<[number, number] | null>(null);
  const [streetName, setStreetName] = useState('');
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);
  const [routedCoords, setRoutedCoords] = useState<[number, number][]>([]);
  const [elevSegments, setElevSegments] = useState<ElevSegment[]>([]);
  const [elevStatus, setElevStatus] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle');
  const [surfaceType, setSurfaceType] = useState('');
  const [sidewalkWidthM, setSidewalkWidthM] = useState('');
  const [hasTactilePaving, setHasTactilePaving] = useState<boolean | null>(null);
  const [isStepFree, setIsStepFree] = useState<boolean | null>(null);
  const [hasCurbCuts, setHasCurbCuts] = useState<boolean | null>(null);
  const [hasRamp, setHasRamp] = useState<boolean | null>(null);
  const [lit, setLit] = useState<boolean | null>(null);
  const elevCoordsRef = useRef<[number, number][]>([]);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addrBusy, setAddrBusy] = useState(false);
  const revAbortRef = useRef<AbortController | null>(null);

  // Reverse-geocode a user-picked map location into the address field. Only fires
  // on a genuine pin pick (LocationPicker never emits on mount / external value),
  // so a prefilled address is never clobbered.
  async function fillAddressFromPin(lng: number, lat: number) {
    revAbortRef.current?.abort();
    const ctrl = new AbortController();
    revAbortRef.current = ctrl;
    setAddrBusy(true);
    try {
      const label = await reverseGeocode(lng, lat, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (label) setAddress(label);
    } finally {
      if (!ctrl.signal.aborted) setAddrBusy(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lng = parseFloat(params.get('lng') ?? '');
    const lat = parseFloat(params.get('lat') ?? '');
    const addr = params.get('address') ?? '';
    if (!isNaN(lng) && !isNaN(lat)) { setLoc([lng, lat]); setInitialCenter([lng, lat]); }
    if (addr) setAddress(addr);

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace('/auth?next=/contribute'); return; }
      setCatalog(await getCatalog());
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const features = catalog.filter((f) => f.categories.includes(category));

  // Elevation split — one DB row per grade sub-segment (from the OSRM-snapped path).
  async function handleRouteChange(coords: [number, number][]) {
    setRoutedCoords(coords);
    setElevSegments([]);
    if (coords.length < 2) { setElevStatus('idle'); return; }
    setElevStatus('loading');
    elevCoordsRef.current = coords;
    const segs = await splitByElevation(coords);
    if (elevCoordsRef.current !== coords) return; // stale
    if (segs.length === 0) setElevStatus('failed');
    else { setElevSegments(segs); setElevStatus('done'); }
  }

  function canProceed(): boolean {
    if (step === 1) return kind !== null;
    if (step === 2) return kind === 'point' ? name.trim().length > 0 : streetName.trim().length > 0;
    if (step === 3) return kind === 'point' ? loc !== null : waypoints.length >= 2 && elevStatus !== 'loading';
    return true;
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (kind === 'point') {
        const p = loc ?? ([loadCity().lng, loadCity().lat] as [number, number]);
        const cleaned: Record<string, FeatureValue> = {};
        for (const [k, v] of Object.entries(values)) if (v === 'yes' || v === 'no') cleaned[k] = v;
        const photoUrls = await uploadPhotos(photos, 'points');
        const res = await api.post<{ id: string }>('/points', {
          name, category, lat: p[1], lng: p[0], address, description, features: cleaned, photos: photoUrls,
        });
        router.push(`/point/${res.id}`);
        return;
      }
      // pathway → one row per elevation-split sub-segment (or the whole path)
      const common = {
        streetName,
        surfaceType: surfaceType || undefined,
        sidewalkWidthM: sidewalkWidthM ? parseFloat(sidewalkWidthM) : null,
        hasTactilePaving, isStepFree, hasCurbCuts, hasRamp, lit,
      };
      if (elevSegments.length > 0) {
        for (const seg of elevSegments) await submitSegment({ ...common, coords: seg.coords, inclinePercent: seg.inclinePercent });
      } else {
        const coords = routedCoords.length >= 2 ? routedCoords : waypoints;
        await submitSegment({ ...common, coords, inclinePercent: null });
      }
      router.push('/map');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не вдалося зберегти');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  const lastStep = 4;
  const primaryLabel = busy
    ? 'Збереження…'
    : step < lastStep
    ? 'Далі'
    : kind === 'pathway' && elevStatus === 'loading'
    ? 'Зачекайте — аналіз висот…'
    : kind === 'pathway' && elevSegments.length > 1
    ? `Надіслати ${elevSegments.length} ділянки`
    : 'Надіслати';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="map" />
      <main id="main-content" tabIndex={-1} style={{ flex: 1, width: '100%', maxWidth: 'min(100%, 640px)', margin: '0 auto', padding: '1.6em 1.25em 4em' }}>
        <h1 style={{ margin: '0 0 0.15em', fontSize: '1.7em', fontWeight: 800 }}>Додати на мапу</h1>
        <p style={{ margin: '0 0 1.3em', color: 'var(--sc-muted)', fontSize: '0.92em' }}>
          Крок за кроком — місце або пішохідний шлях, який ви знаєте.
        </p>

        {/* Stepper — segmented progress with only the current step's title */}
        <div style={{ marginBottom: '1.6em' }}>
          <div style={{ display: 'flex', gap: '0.4em' }}>
            {STEPS.map((label, i) => (
              <div key={label} style={{ flex: 1, height: '0.4em', borderRadius: '1em', background: i + 1 <= step ? 'var(--sc-primary)' : 'var(--sc-surface-2)', transition: 'background .3s' }} />
            ))}
          </div>
          <div style={{ marginTop: '0.55em', fontWeight: 800, fontSize: '1.05em', color: 'var(--sc-primary)' }}>
            {STEPS[step - 1]}
          </div>
        </div>

        <div key={`step-${step}-${kind}`} className="sc-animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.1em' }}>
          {/* ── Step 1: type ── */}
          {step === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '0.9em' }}>
              {([
                { k: 'point' as const, Icon: MapPin, title: 'Місце на мапі', body: 'Заклад, зупинка, туалет, паркування — точка з рівнем доступності.' },
                { k: 'pathway' as const, Icon: Footprints, title: 'Пішохідний шлях', body: 'Ділянка тротуару чи переходу — з покриттям і зручностями для руху.' },
              ]).map(({ k, Icon, title, body }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  style={{
                    textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: '0.6em',
                    padding: '1.3em', borderRadius: '1.1em', background: 'var(--sc-surface)',
                    border: `2px solid ${kind === k ? 'var(--sc-primary)' : 'var(--sc-border)'}`,
                  }}
                >
                  <span aria-hidden style={{ width: '3em', height: '3em', borderRadius: '0.9em', display: 'grid', placeItems: 'center', background: 'var(--sc-primary-tint)', color: 'var(--sc-primary)' }}>
                    <Icon size={24} />
                  </span>
                  <span style={{ fontWeight: 800, fontSize: '1.05em' }}>{title}</span>
                  <span style={{ fontSize: '0.86em', color: 'var(--sc-muted)', lineHeight: 1.45 }}>{body}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Step 2: details ── */}
          {step === 2 && kind === 'point' && (
            <>
              <Field label="Назва" required value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. Кав'ярня «Кава»" />
              <div>
                <label htmlFor="desc" style={{ display: 'block', fontWeight: 600, fontSize: '0.9em', marginBottom: '0.4em' }}>Опис</label>
                <textarea
                  id="desc" className="sc-foc" value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Що це за місце та що варто знати про доступність?" rows={3}
                  style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: '0.7em 0.9em', borderRadius: '0.7em', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'inherit', fontSize: '1em', border: 'var(--sc-bw) solid var(--sc-border-strong)', resize: 'vertical' }}
                />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9em', marginBottom: '0.5em' }}>Категорія</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em' }}>
                  {CATEGORIES.map((c) => (
                    <button
                      key={c} type="button" className="sc-foc" aria-pressed={category === c} onClick={() => setCategory(c)}
                      style={{
                        minHeight: '2.6em', padding: '0 1em', borderRadius: '2em', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
                        border: `var(--sc-bw) solid ${category === c ? 'var(--sc-primary)' : 'var(--sc-border-strong)'}`,
                        background: category === c ? 'var(--sc-primary)' : 'var(--sc-surface)',
                        color: category === c ? 'var(--sc-on-primary)' : 'var(--sc-text)',
                      }}
                    >
                      {categoryLabel[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9em', marginBottom: '0.5em' }}>Фото (необов’язково)</div>
                <PhotoInput files={photos} onChange={setPhotos} />
              </div>
            </>
          )}
          {step === 2 && kind === 'pathway' && (
            <>
              <Field label="Назва вулиці" required value={streetName} onChange={(e) => setStreetName(e.target.value)} placeholder="напр. Вулиця Городоцька" />
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9em', marginBottom: '0.4em' }}>Покриття</label>
                <select
                  className="sc-foc" value={surfaceType} onChange={(e) => setSurfaceType(e.target.value)}
                  style={{ width: '100%', padding: '0.7em 0.9em', borderRadius: '0.7em', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'var(--font-onest), system-ui, sans-serif', fontSize: '1em', border: 'var(--sc-bw) solid var(--sc-border-strong)' }}
                >
                  {SURFACE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </>
          )}

          {/* ── Step 3: location ── */}
          {step === 3 && kind === 'point' && (
            <>
              <div>
                <Field label="Адреса" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="вул. Прикладна, 1" />
                <p style={{ margin: '0.35em 0 0', fontSize: '0.78em', color: 'var(--sc-muted)' }}>
                  {addrBusy ? 'Визначаємо адресу за міткою…' : 'Підставляється автоматично з мітки на мапі — можна змінити.'}
                </p>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9em', marginBottom: '0.5em' }}>Місцезнаходження <span style={{ color: 'var(--sc-bad)' }}>*</span></div>
                <LocationPicker value={loc} onChange={(lng, lat) => { setLoc([lng, lat]); void fillAddressFromPin(lng, lat); }} />
              </div>
            </>
          )}
          {step === 3 && kind === 'pathway' && (
            <>
              <p style={{ margin: 0, color: 'var(--sc-muted)', fontSize: '0.9em' }}>
                Натисніть на карті, щоб позначити початок і кінець шляху. Можна додати кілька точок.
              </p>
              <SegmentPicker value={waypoints} onChange={setWaypoints} onRouteChange={handleRouteChange} elevSegments={elevSegments} initialCenter={initialCenter} />
              {elevStatus === 'loading' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', color: 'var(--sc-primary)', fontSize: '0.88em', fontWeight: 700 }}>
                  <span aria-hidden style={{ display: 'inline-block', width: '1em', height: '1em', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Аналізуємо профіль висот…
                </div>
              )}
              {elevStatus === 'done' && elevSegments.length > 0 && (
                <div style={{ background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.9em', padding: '0.8em 1em' }}>
                  <div style={{ fontSize: '0.8em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sc-muted)', marginBottom: '0.6em' }}>
                    Ділянки за нахилом ({elevSegments.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35em' }}>
                    {elevSegments.map((seg, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5em' }}>
                        <span style={{ fontSize: '0.82em', color: 'var(--sc-muted)' }}>Ділянка {i + 1}</span>
                        <span style={{ fontSize: '0.85em', fontWeight: 700, color: gradeColor(seg.inclinePercent) }}>{gradeLabel(seg.inclinePercent)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {elevStatus === 'failed' && (
                <p style={{ fontSize: '0.82em', color: 'var(--sc-muted)', margin: 0 }}>Не вдалося отримати дані висот — шлях буде збережено без нахилу.</p>
              )}
            </>
          )}

          {/* ── Step 4: inclusiveness ── */}
          {step === 4 && kind === 'point' && (
            <fieldset style={{ border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '0.6em 1em', margin: 0 }}>
              <legend style={{ fontWeight: 700, fontSize: '0.9em', padding: '0 0.4em' }}>Зручності доступності</legend>
              {features.length === 0 ? (
                <p style={{ margin: '0.4em 0', color: 'var(--sc-muted)', fontSize: '0.88em' }}>Для цієї категорії немає критеріїв.</p>
              ) : features.map((f) => (
                <Row key={f.key} label={f.label} star={f.critical}>
                  <TriToggle
                    value={values[f.key] ?? 'unknown'}
                    options={VAL_OPTS}
                    onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                  />
                </Row>
              ))}
            </fieldset>
          )}
          {step === 4 && kind === 'pathway' && (
            <>
              <Field label="Ширина тротуару (м)" value={sidewalkWidthM} onChange={(e) => setSidewalkWidthM(e.target.value)} placeholder="напр. 1.5" type="number" />
              <fieldset style={{ border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '0.6em 1em', margin: 0 }}>
                <legend style={{ fontWeight: 700, fontSize: '0.9em', padding: '0 0.4em' }}>Доступність</legend>
                <Row label="Без сходинок"><TriToggle value={isStepFree} options={BOOL_OPTS} onChange={setIsStepFree} /></Row>
                <Row label="Тактильне покриття"><TriToggle value={hasTactilePaving} options={BOOL_OPTS} onChange={setHasTactilePaving} /></Row>
                <Row label="Знижений бордюр"><TriToggle value={hasCurbCuts} options={BOOL_OPTS} onChange={setHasCurbCuts} /></Row>
                <Row label="Пандус"><TriToggle value={hasRamp} options={BOOL_OPTS} onChange={setHasRamp} /></Row>
                <Row label="Освітлення"><TriToggle value={lit} options={BOOL_OPTS} onChange={setLit} /></Row>
              </fieldset>
            </>
          )}

          {error && <div role="alert" style={{ color: 'var(--sc-bad)', fontWeight: 700, fontSize: '0.85em' }}>{error}</div>}

          {/* Nav */}
          <div style={{ display: 'flex', gap: '0.7em', marginTop: '0.4em' }}>
            {step > 1 && (
              <Button variant="secondary" onClick={() => { setError(null); setStep((s) => s - 1); }} disabled={busy} style={{ flex: '0 0 auto' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', whiteSpace: 'nowrap' }}>
                  <ArrowLeft size={16} aria-hidden /> Назад
                </span>
              </Button>
            )}
            <Button
              onClick={() => { if (step < lastStep) { setError(null); setStep((s) => s + 1); } else void submit(); }}
              disabled={!canProceed() || busy}
              block
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5em', whiteSpace: 'nowrap' }}>
                {primaryLabel} {step < lastStep && <ArrowRight size={16} aria-hidden />}
              </span>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
