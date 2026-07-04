'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccessibilityFeature, Category, FeatureValue } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { LocationPicker } from '@/components/LocationPicker';
import { Button, Field, Segmented } from '@/components/ui';
import { getCatalog } from '@/lib/catalog';
import { ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { categoryLabel } from '@/lib/format';
import { pointById, updatePoint, deletePoint } from '@/lib/points';

const CATEGORIES: Category[] = ['venue', 'transit', 'crossing', 'toilet', 'parking'];
const VAL_OPTS: { value: FeatureValue; label: string }[] = [
  { value: 'yes', label: 'Так' },
  { value: 'no', label: 'Ні' },
  { value: 'unknown', label: '?' },
];

export default function EditPointPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [gate, setGate] = useState<'loading' | 'ready' | 'notfound'>('loading');
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('venue');
  const [loc, setLoc] = useState<[number, number] | null>(null);
  const [values, setValues] = useState<Record<string, FeatureValue>>({});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace(`/auth?next=/point/${id}/edit`);
        return;
      }
      const [cat, p] = await Promise.all([getCatalog(), pointById(id)]);
      setCatalog(cat);
      if (!p) {
        setGate('notfound');
        return;
      }
      setName(p.name);
      setAddress(p.address ?? '');
      setDescription(p.description ?? '');
      setCategory(p.category);
      setLoc([p.lng, p.lat]);
      setValues({ ...(p.features as Record<string, FeatureValue>) });
      setGate('ready');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const features = useMemo(() => catalog.filter((f) => f.categories.includes(category)), [catalog, category]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const p = loc ?? [0, 0];
      const cleaned: Record<string, FeatureValue> = {};
      for (const [k, v] of Object.entries(values)) if (v === 'yes' || v === 'no') cleaned[k] = v;
      await updatePoint(id, { name, category, lat: p[1], lng: p[0], address, description, features: cleaned });
      toast('Зміни збережено.', 'success');
      router.push(`/point/${id}`);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 404) {
        toast('Це не ваша точка або її вже видалено.', 'error');
      } else {
        toast(err instanceof Error ? err.message : 'Не вдалося зберегти', 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm('Видалити цю точку? Дію не можна скасувати.')) return;
    setDeleting(true);
    try {
      await deletePoint(id);
      toast('Точку видалено.', 'success');
      router.push('/business');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Не вдалося видалити', 'error');
      setDeleting(false);
    }
  }

  if (gate === 'loading') return null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="business" />
      <main id="main-content" tabIndex={-1} style={{ flex: 1, width: '100%', maxWidth: 'min(100%, 620px)', margin: '0 auto', padding: '1.6em 1.25em 4em' }}>
        <h1 style={{ margin: '0 0 1em', fontSize: '1.7em', fontWeight: 800 }}>Редагувати точку</h1>

        {gate === 'notfound' ? (
          <p style={{ color: 'var(--sc-muted)' }}>Точку не знайдено.</p>
        ) : (
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1.1em' }}>
            <Field label="Назва" required value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. Кав'ярня «Кава»" />
            <Field label="Адреса" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="вул. Прикладна, 1" />

            <div>
              <label htmlFor="desc" style={{ display: 'block', fontWeight: 600, fontSize: '0.9em', marginBottom: '0.4em' }}>Опис</label>
              <textarea
                id="desc"
                className="sc-foc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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

            <Button type="submit" disabled={busy || !name.trim()} block>
              {busy ? 'Збереження…' : 'Зберегти зміни'}
            </Button>

            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="sc-foc"
              style={{
                minHeight: '2.6em', borderRadius: '0.7em', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
                border: 'var(--sc-bw) solid var(--sc-bad)', background: 'transparent', color: 'var(--sc-bad)',
              }}
            >
              {deleting ? 'Видалення…' : 'Видалити точку'}
            </button>
          </form>
        )}
      </main>
      <Footer />
    </div>
  );
}
