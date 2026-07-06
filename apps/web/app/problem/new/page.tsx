'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { Button, Field, Segmented, LoadingState } from '@/components/ui';
import { PhotoInput } from '@/components/PhotoInput';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { uploadPhotos } from '@/lib/storage';
import { pointById } from '@/lib/points';
import { geocodePlaces, type GeoPlace } from '@/lib/geocode';

const SEVERITY: { value: '1' | '2' | '3'; label: string }[] = [
  { value: '1', label: 'Незначна' },
  { value: '2', label: 'Середня' },
  { value: '3', label: 'Серйозна' },
];

interface Loc { lng: number; lat: number; label: string }

function NewProblemInner() {
  const router = useRouter();
  const params = useSearchParams();
  const pointId = params.get('point');

  const [ready, setReady] = useState(false);
  const [pointName, setPointName] = useState<string | null>(null);

  // Location for a standalone report (no point): seeded from a dropped pin's
  // ?lng=&lat=&label=, or chosen via address search.
  const qLng = Number(params.get('lng'));
  const qLat = Number(params.get('lat'));
  const seeded = Number.isFinite(qLng) && Number.isFinite(qLat) && (qLng !== 0 || qLat !== 0);
  const [loc, setLoc] = useState<Loc | null>(
    seeded ? { lng: qLng, lat: qLat, label: params.get('label') || `${qLat.toFixed(5)}, ${qLng.toFixed(5)}` } : null,
  );
  const [locQuery, setLocQuery] = useState('');
  const [locResults, setLocResults] = useState<GeoPlace[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'1' | '2' | '3'>('2');
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        const back = `/problem/new${typeof window !== 'undefined' ? window.location.search : ''}`;
        router.replace(`/auth?next=${encodeURIComponent(back)}`);
        return;
      }
      if (pointId) {
        const p = await pointById(pointId);
        setPointName(p?.name ?? null);
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Address search for the location (only when not tied to a point / not chosen yet).
  useEffect(() => {
    if (pointId || loc || locQuery.trim().length < 3) { setLocResults([]); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t = setTimeout(() => {
      geocodePlaces(locQuery, 5, ctrl.signal).then(setLocResults).catch(() => {});
    }, 320);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [locQuery, loc, pointId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pointId && !loc) {
      setError('Оберіть локацію проблеми — знайдіть адресу нижче або поставте мітку на мапі.');
      return;
    }
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.push('/auth?next=/problem/new');
        return;
      }
      const photoUrls = await uploadPhotos(photos, 'problems');
      const body = pointId
        ? { point_id: pointId, title, description, severity: Number(severity), photos: photoUrls }
        : { lat: loc!.lat, lng: loc!.lng, title, description, severity: Number(severity), photos: photoUrls };
      await api.post<{ id: string }>('/problems', body);
      router.push('/map?reported=1');
    } catch (err: any) {
      setError(err?.message ?? 'Не вдалося надіслати');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  const locationLabel = pointId ? pointName : loc?.label;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="problem" />
      <main id="main-content" tabIndex={-1} className="sc-stagger" style={{ flex: 1, width: '100%', maxWidth: 'min(100%, 560px)', margin: '0 auto', padding: '1.6em 1.25em 4em' }}>
        <Link href={pointId ? `/point/${pointId}` : '/map'} className="sc-foc" style={{ color: 'var(--sc-primary)', fontWeight: 700, textDecoration: 'none', fontSize: '0.9em' }}>
          ‹ Назад
        </Link>
        <h1 style={{ margin: '0.5em 0 0.2em', fontSize: '1.7em', fontWeight: 800 }}>Повідомити про проблему</h1>
        <p style={{ margin: '0 0 1.2em', color: 'var(--sc-muted)', fontSize: '0.92em' }}>
          Ваше звернення надійде адміністраторам міста.
        </p>

        {/* Location: fixed for a point, chosen for a standalone report */}
        {pointId ? (
          <p style={{ margin: '0 0 1.2em', color: 'var(--sc-muted)' }}>Місце: {pointName ?? '…'}</p>
        ) : loc ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', margin: '0 0 1.2em', padding: '0.7em 0.9em', borderRadius: '0.7em', border: 'var(--sc-bw) solid var(--sc-border)', background: 'var(--sc-surface)' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: '0.9em' }}>📍 {loc.label}</span>
            <button type="button" className="sc-foc" onClick={() => { setLoc(null); setLocQuery(''); }} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--sc-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85em' }}>Змінити</button>
          </div>
        ) : (
          <div style={{ position: 'relative', margin: '0 0 1.2em' }}>
            <label htmlFor="ploc" style={{ display: 'block', fontWeight: 600, fontSize: '0.9em', marginBottom: '0.4em' }}>Локація проблеми <span style={{ color: 'var(--sc-bad)' }}>*</span></label>
            <input
              id="ploc"
              className="sc-foc"
              value={locQuery}
              onChange={(e) => setLocQuery(e.target.value)}
              placeholder="Знайдіть адресу або місце…"
              autoComplete="off"
              style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: '0.7em 0.9em', borderRadius: '0.7em', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'inherit', fontSize: '1em', border: 'var(--sc-bw) solid var(--sc-border-strong)' }}
            />
            <p style={{ margin: '0.4em 0 0', fontSize: '0.8em', color: 'var(--sc-muted)' }}>
              Або поставте мітку на <Link href="/map" className="sc-foc" style={{ color: 'var(--sc-primary)', fontWeight: 700 }}>мапі</Link> й натисніть «Повідомити про проблему».
            </p>
            {locResults.length > 0 && (
              <ul style={{ position: 'absolute', top: 'calc(100% - 1em)', left: 0, right: 0, zIndex: 20, margin: '0.2em 0 0', padding: 0, listStyle: 'none', background: 'var(--sc-surface)', border: '1.5px solid var(--sc-border-strong)', borderRadius: '0.7em', boxShadow: 'var(--sc-shadow-2)', overflow: 'hidden' }}>
                {locResults.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => { setLoc({ lng: r.lng, lat: r.lat, label: r.label }); setLocResults([]); }}
                      style={{ width: '100%', textAlign: 'left', padding: '0.6em 0.9em', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88em', color: 'var(--sc-text)', borderBottom: '1px solid var(--sc-border)' }}>
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1em' }}>
          <Field label="Заголовок" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="напр. Зламаний пандус біля входу" />
          <div>
            <label htmlFor="pdesc" style={{ display: 'block', fontWeight: 600, fontSize: '0.9em', marginBottom: '0.4em' }}>Опис</label>
            <textarea
              id="pdesc"
              className="sc-foc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опишіть бар’єр детальніше"
              rows={4}
              style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: '0.7em 0.9em', borderRadius: '0.7em', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'inherit', fontSize: '1em', border: 'var(--sc-bw) solid var(--sc-border-strong)', resize: 'vertical' }}
            />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9em', marginBottom: '0.5em' }}>Серйозність</div>
            <Segmented ariaLabel="Серйозність" value={severity} onChange={setSeverity} options={SEVERITY} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9em', marginBottom: '0.5em' }}>Фото (необов’язково)</div>
            <PhotoInput files={photos} onChange={setPhotos} />
          </div>
          {error ? <div role="alert" style={{ color: 'var(--sc-bad)', fontWeight: 700, fontSize: '0.85em' }}>{error}</div> : null}
          <Button type="submit" disabled={busy || !title.trim() || (!pointId && !loc)} block>
            {busy ? 'Надсилання…' : 'Надіслати'}
          </Button>
        </form>
      </main>
      <Footer />
    </div>
  );
}

export default function NewProblemPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2em' }}><LoadingState /></div>}>
      <NewProblemInner />
    </Suspense>
  );
}
