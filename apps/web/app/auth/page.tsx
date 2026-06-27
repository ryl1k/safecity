'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { Button, Field, LoadingState } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { syncProfileToAccount } from '@/lib/account';

function AuthInner() {
  const router = useRouter();
  const next = useSearchParams().get('next') || '/map';
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'up') {
        const res = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Не вдалося створити акаунт');
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await syncProfileToAccount();
        router.push(next);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await syncProfileToAccount();
        router.push(next);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Помилка входу');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader />
      <main id="main-content" tabIndex={-1} style={{ width: '100%', maxWidth: 'min(100%, 420px)', margin: '0 auto', padding: '2.4em 1.25em 4em' }}>
        <h1 style={{ margin: '0 0 0.2em', fontSize: '1.6em', fontWeight: 800 }}>
          {mode === 'in' ? 'Увійти' : 'Створити акаунт'}
        </h1>
        <p style={{ margin: '0 0 1.4em', color: 'var(--sc-muted)' }}>
          Акаунт потрібен лише, щоб додавати місця, відгуки та підтримувати петиції.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1em' }}>
          <Field label="Пошта" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <Field label="Пароль" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
          {error ? <div role="alert" style={{ color: 'var(--sc-bad)', fontWeight: 700, fontSize: '0.85em' }}>{error}</div> : null}
          {info ? <div role="status" style={{ color: 'var(--sc-ok)', fontWeight: 700, fontSize: '0.85em' }}>{info}</div> : null}
          <Button type="submit" disabled={busy} block>
            {busy ? 'Зачекайте…' : mode === 'in' ? 'Увійти' : 'Зареєструватися'}
          </Button>
        </form>

        <button
          className="sc-foc"
          onClick={() => { setMode((m) => (m === 'in' ? 'up' : 'in')); setError(null); setInfo(null); }}
          style={{ marginTop: '1.2em', background: 'none', border: 'none', color: 'var(--sc-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {mode === 'in' ? 'Немає акаунта? Зареєструватися' : 'Вже маєте акаунт? Увійти'}
        </button>

        <div style={{ marginTop: '1.6em' }}>
          <Link href="/map" style={{ color: 'var(--sc-muted)', fontSize: '0.85em' }}>Продовжити як гість</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2em' }}><LoadingState /></div>}>
      <AuthInner />
    </Suspense>
  );
}
