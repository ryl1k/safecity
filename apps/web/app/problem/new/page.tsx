'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { Button, Field, Segmented, LoadingState } from '@/components/ui';
import { PhotoInput } from '@/components/PhotoInput';
import { supabase } from '@/lib/supabase';
import { uploadPhotos } from '@/lib/storage';
import { pointById } from '@/lib/points';

const SEVERITY: { value: '1' | '2' | '3'; label: string }[] = [
  { value: '1', label: 'Незначна' },
  { value: '2', label: 'Середня' },
  { value: '3', label: 'Серйозна' },
];

function NewProblemInner() {
  const router = useRouter();
  const pointId = useSearchParams().get('point');
  const [ready, setReady] = useState(false);
  const [pointName, setPointName] = useState<string | null>(null);
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
        router.replace(`/auth?next=${encodeURIComponent(`/problem/new${pointId ? `?point=${pointId}` : ''}`)}`);
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pointId) {
      setError('Немає прив’язаного місця.');
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
      const { data, error } = await supabase
        .from('problems')
        .insert({
          point_id: pointId,
          title,
          description: description || null,
          severity: Number(severity),
          photos: photoUrls,
          created_by: auth.user.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      router.push(`/problem/${data.id}`);
    } catch (err: any) {
      setError(err?.message ?? 'Не вдалося надіслати');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="civic" />
      <main style={{ flex: 1, width: '100%', maxWidth: 560, margin: '0 auto', padding: '1.6em 1.25em 4em' }}>
        <Link href={pointId ? `/point/${pointId}` : '/map'} className="sc-foc" style={{ color: 'var(--sc-primary)', fontWeight: 700, textDecoration: 'none', fontSize: '0.9em' }}>
          ‹ Назад
        </Link>
        <h1 style={{ margin: '0.5em 0 0.2em', fontSize: '1.7em', fontWeight: 800 }}>Повідомити про проблему</h1>
        {pointName ? <p style={{ margin: '0 0 1.2em', color: 'var(--sc-muted)' }}>Місце: {pointName}</p> : <div style={{ height: '1em' }} />}

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
              style={{ width: '100%', padding: '0.7em 0.9em', borderRadius: '0.7em', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'inherit', fontSize: '1em', border: 'var(--sc-bw) solid var(--sc-border-strong)', resize: 'vertical' }}
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
          <Button type="submit" disabled={busy || !title.trim()} block>
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
