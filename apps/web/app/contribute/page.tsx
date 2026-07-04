'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccessibilityFeature, Category, FeatureValue } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { LocationPicker } from '@/components/LocationPicker';
import { PhotoInput } from '@/components/PhotoInput';
import { Button, Field, Segmented } from '@/components/ui';
import { getCatalog } from '@/lib/catalog';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { uploadPhotos } from '@/lib/storage';
import { categoryLabel } from '@/lib/format';
import { loadCity } from '@/lib/cities';

const CATEGORIES: Category[] = ['venue', 'transit', 'crossing', 'toilet', 'parking'];
const VAL_OPTS: { value: FeatureValue; label: string }[] = [
  { value: 'yes', label: 'Так' },
  { value: 'no', label: 'Ні' },
  { value: 'unknown', label: '?' },
];

export default function ContributePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('venue');
  const [loc, setLoc] = useState<[number, number] | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [values, setValues] = useState<Record<string, FeatureValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Pre-fill location + address when navigating from the map marker panel.
    const params = new URLSearchParams(window.location.search);
    const lng = parseFloat(params.get('lng') ?? '');
    const lat = parseFloat(params.get('lat') ?? '');
    const addr = params.get('address') ?? '';
    if (!isNaN(lng) && !isNaN(lat)) setLoc([lng, lat]);
    if (addr) setAddress(addr);

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace('/auth?next=/contribute');
        return;
      }
      setCatalog(await getCatalog());
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const features = useMemo(() => catalog.filter((f) => f.categories.includes(category)), [catalog, category]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const p = loc ?? ([loadCity().lng, loadCity().lat] as [number, number]);
      const cleaned: Record<string, FeatureValue> = {};
      for (const [k, v] of Object.entries(values)) if (v === 'yes' || v === 'no') cleaned[k] = v;
      const photoUrls = await uploadPhotos(photos, 'points');
      const res = await api.post<{ id: string }>('/points', {
        name,
        category,
        lat: p[1],
        lng: p[0],
        address,
        description,
        features: cleaned,
        photos: photoUrls,
      });
      router.push(`/point/${res.id}`);
    } catch (err: unknown) {
      // The 10-point cap is only ever surfaced here, at the moment it's hit.
      if (err instanceof ApiError && err.code === 'point_limit') {
        toast('Ви досягли ліміту в 10 точок. Оформіть бізнес-підписку для необмеженої кількості точок.', 'error');
      } else {
        setError(err instanceof Error ? err.message : 'Не вдалося додати місце');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="map" />
      <main id="main-content" tabIndex={-1} style={{ flex: 1, width: '100%', maxWidth: 'min(100%, 620px)', margin: '0 auto', padding: '1.6em 1.25em 4em' }}>
        <h1 style={{ margin: '0 0 1em', fontSize: '1.7em', fontWeight: 800 }}>Додати місце</h1>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1em' }}>
          <Field label="Назва" required value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. Кав'ярня «Кава»" />
          <Field label="Адреса" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="вул. Прикладна, 1" />

          <div>
            <label htmlFor="desc" style={{ display: 'block', fontWeight: 600, fontSize: '0.9em', marginBottom: '0.4em' }}>Опис</label>
            <textarea
              id="desc"
              className="sc-foc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Що це за місце та що варто знати про доступність?"
              rows={3}
              style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: '0.7em 0.9em', borderRadius: '0.7em', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'inherit', fontSize: '1em', border: 'var(--sc-bw) solid var(--sc-border-strong)', resize: 'vertical' }}
            />
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9em', marginBottom: '0.5em' }}>Категорія</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em' }}>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="sc-foc"
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
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
            <div style={{ fontWeight: 600, fontSize: '0.9em', marginBottom: '0.5em' }}>Місцезнаходження</div>
            <LocationPicker value={loc} onChange={(lng, lat) => setLoc([lng, lat])} />
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9em', marginBottom: '0.5em' }}>Фото (необов’язково)</div>
            <PhotoInput files={photos} onChange={setPhotos} />
          </div>

          <fieldset style={{ border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '1em' }}>
            <legend style={{ fontWeight: 700, fontSize: '0.9em', padding: '0 0.4em' }}>Зручності доступності</legend>
            {features.map((f) => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '0.8em', padding: '0.5em 0', flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: '0.9em', fontWeight: 600 }}>
                  {f.label}
                  {f.critical ? <span style={{ color: 'var(--sc-accent)' }}> ★</span> : null}
                </span>
                <div style={{ width: 'min(100%, 180px)' }}>
                  <Segmented
                    ariaLabel={f.label}
                    value={values[f.key] ?? 'unknown'}
                    onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                    options={VAL_OPTS}
                  />
                </div>
              </div>
            ))}
          </fieldset>

          {error ? <div role="alert" style={{ color: 'var(--sc-bad)', fontWeight: 700, fontSize: '0.85em' }}>{error}</div> : null}
          <Button type="submit" disabled={busy || !name.trim()} block>
            {busy ? 'Збереження…' : 'Додати місце'}
          </Button>
        </form>
      </main>
      <Footer />
    </div>
  );
}
