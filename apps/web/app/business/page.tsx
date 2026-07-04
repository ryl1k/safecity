'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { Button, LoadingState, ErrorState } from '@/components/ui';
import { categoryLabel } from '@/lib/format';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { businessMe, subscribeBusiness, type BusinessMe, type SubscriptionPlan } from '@/lib/business';

type Gate = 'loading' | 'guest' | 'ok' | 'error';

const verifyStatusLabel: Record<string, string> = {
  unverified: 'Не перевірено модератором',
  verified: 'Перевірено модератором',
  official: 'Офіційно підтверджено',
};

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.3em', marginBottom: '1em',
} as const;

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('uk-UA');
}

export default function BusinessPage() {
  const [gate, setGate] = useState<Gate>('loading');
  const [me, setMe] = useState<BusinessMe | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setGate('loading');
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setGate('guest');
        return;
      }
      setMe(await businessMe());
      setGate('ok');
    } catch {
      setGate('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubscribe(plan: SubscriptionPlan) {
    setBusy(true);
    try {
      await subscribeBusiness(plan);
      setMe(await businessMe());
      toast('Бізнес-підписку активовано — тепер точки без обмежень.', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Не вдалося оформити підписку', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="business" />
      <main id="main-content" tabIndex={-1} style={{ width: '100%', maxWidth: 'min(100%, 700px)', margin: '0 auto', padding: '1.6em 1.25em 4em' }}>
        <h1 style={{ margin: '0 0 1em', fontSize: '1.7em', fontWeight: 800 }}>Мої точки</h1>

        {gate === 'loading' && <LoadingState label="Завантаження акаунта" />}
        {gate === 'error' && <ErrorState onRetry={() => void load()} />}

        {gate === 'guest' && (
          <section style={card}>
            <p style={{ margin: '0 0 1em' }}>Увійдіть, щоб керувати своїми точками.</p>
            <Link href="/auth?next=/business" style={{ textDecoration: 'none' }}><Button>Увійти</Button></Link>
          </section>
        )}

        {gate === 'ok' && me && (
          <>
            {/* Account status / upgrade */}
            {me.isBusiness ? (
              <section style={{ ...card, borderColor: 'var(--sc-ok-line)', background: 'var(--sc-ok-bg)' }}>
                <div style={{ fontWeight: 800, color: 'var(--sc-ok)', marginBottom: '0.3em' }}>Бізнес-акаунт активний</div>
                <p style={{ margin: 0, color: 'var(--sc-muted)', fontSize: '0.9em' }}>
                  Необмежена кількість точок, пріоритет у пошуку та позначка бізнесу.
                  {me.plan ? ` Підписка (${me.plan === 'yearly' ? 'річна' : 'місячна'})` : ''}
                  {me.renewsAt ? ` діє до ${fmtDate(me.renewsAt)}.` : '.'}
                </p>
              </section>
            ) : (
              <section style={card}>
                <div style={{ fontWeight: 800, marginBottom: '0.3em' }}>Станьте бізнесом</div>
                <p style={{ margin: '0 0 1em', color: 'var(--sc-muted)', fontSize: '0.9em' }}>
                  Необмежена кількість точок, пріоритет у результатах пошуку та позначка бізнесу на всіх ваших точках.
                </p>
                <div style={{ display: 'flex', gap: '0.6em', flexWrap: 'wrap' }}>
                  <Button onClick={() => onSubscribe('monthly')} disabled={busy}>
                    {busy ? 'Обробка…' : 'Місячна підписка'}
                  </Button>
                  <Button variant="secondary" onClick={() => onSubscribe('yearly')} disabled={busy}>
                    {busy ? 'Обробка…' : 'Річна підписка'}
                  </Button>
                </div>
              </section>
            )}

            {/* The user's created points */}
            {me.points.length === 0 ? (
              <section style={card}>
                <p style={{ margin: '0 0 1em', color: 'var(--sc-muted)' }}>Ви ще не додали жодної точки.</p>
                <Link href="/contribute" style={{ textDecoration: 'none' }}>
                  <Button variant="secondary">Додати точку</Button>
                </Link>
              </section>
            ) : (
              me.points.map((p) => (
                <section key={p.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: '0.8em', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ margin: 0, fontSize: '1.02em', fontWeight: 800 }}>{p.name}</h2>
                    <div style={{ color: 'var(--sc-muted)', fontSize: '0.85em', marginTop: '0.2em' }}>
                      {categoryLabel[p.category as keyof typeof categoryLabel] ?? p.category}
                      {p.address ? ` · ${p.address}` : ''} · {verifyStatusLabel[p.verifyStatus] ?? p.verifyStatus}
                    </div>
                  </div>
                  <Link href={`/point/${p.id}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
                    <Button variant="ghost" style={{ minHeight: '2.2em', fontSize: '0.85em' }}>Переглянути</Button>
                  </Link>
                </section>
              ))
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
