'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { Button, LoadingState, ErrorState } from '@/components/ui';
import { categoryLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import {
  myBusinessPoints,
  payVerification,
  subscribe,
  type BusinessPoint,
  type SubscriptionPlan,
} from '@/lib/business';

type Gate = 'loading' | 'guest' | 'ok' | 'error';

const verifyStatusLabel: Record<string, string> = {
  unverified: 'Не перевірено модератором',
  verified: 'Перевірено модератором',
  official: 'Офіційно підтверджено',
};

const subscriptionStatusLabel: Record<string, string> = {
  none: 'Немає підписки',
  active: 'Підписка активна',
  expired: 'Підписка завершилась',
};

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.3em', marginBottom: '1em',
} as const;
const title = { margin: '0 0 0.8em', fontSize: '1.05em', fontWeight: 800 } as const;

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'muted'; children: React.ReactNode }) {
  const style =
    tone === 'muted'
      ? { background: 'var(--sc-surface-2)', color: 'var(--sc-muted)', border: 'var(--sc-bw) solid var(--sc-border)' }
      : { background: `var(--sc-${tone}-bg)`, color: `var(--sc-${tone})`, border: `var(--sc-bw) solid var(--sc-${tone}-line)` };
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.35em',
        ...style,
        borderRadius: '2em', padding: '0.25em 0.7em', fontWeight: 800, fontSize: '0.78em',
      }}
    >
      {children}
    </span>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('uk-UA');
}

export default function BusinessPage() {
  const [gate, setGate] = useState<Gate>('loading');
  const [points, setPoints] = useState<BusinessPoint[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setGate('loading');
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setGate('guest');
        return;
      }
      setPoints(await myBusinessPoints());
      setGate('ok');
    } catch {
      setGate('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onPay(pointId: string) {
    setActionError(null);
    setBusyId(pointId);
    try {
      await payVerification(pointId);
      setPoints(await myBusinessPoints());
    } catch (err: any) {
      setActionError(err?.message ?? 'Не вдалося підтвердити оплату');
    } finally {
      setBusyId(null);
    }
  }

  async function onSubscribe(pointId: string, plan: SubscriptionPlan) {
    setActionError(null);
    setBusyId(pointId);
    try {
      await subscribe(pointId, plan);
      setPoints(await myBusinessPoints());
    } catch (err: any) {
      setActionError(err?.message ?? 'Не вдалося оформити підписку');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader />
      <main id="main-content" tabIndex={-1} style={{ width: '100%', maxWidth: 'min(100%, 700px)', margin: '0 auto', padding: '1.6em 1.25em 4em' }}>
        <h1 style={{ margin: '0 0 1em', fontSize: '1.7em', fontWeight: 800 }}>Мій бізнес</h1>

        {gate === 'loading' && <LoadingState label="Завантаження бізнес-місць" />}
        {gate === 'error' && <ErrorState onRetry={() => void load()} />}

        {gate === 'guest' && (
          <section style={card}>
            <p style={{ margin: '0 0 1em' }}>Увійдіть, щоб керувати своїми бізнес-місцями.</p>
            <Link href="/auth?next=/business" style={{ textDecoration: 'none' }}><Button>Увійти</Button></Link>
          </section>
        )}

        {gate === 'ok' && (
          <>
            <section style={card}>
              <p style={{ margin: 0, color: 'var(--sc-muted)', fontSize: '0.88em' }}>
                Додайте заклад через форму «Додати місце» з увімкненим перемикачем «Реєструю як бізнес».
                Тут можна підтвердити оплату перевірки та оформити підписку, щоб піднімати місце в пошуку.
              </p>
              <Link href="/contribute" style={{ textDecoration: 'none', display: 'inline-block', marginTop: '0.9em' }}>
                <Button variant="secondary">Додати бізнес-місце</Button>
              </Link>
            </section>

            {actionError ? (
              <div role="alert" style={{ color: 'var(--sc-bad)', fontWeight: 700, fontSize: '0.85em', marginBottom: '1em' }}>{actionError}</div>
            ) : null}

            {points.length === 0 ? (
              <section style={card}>
                <p style={{ margin: 0, color: 'var(--sc-muted)' }}>У вас ще немає бізнес-місць.</p>
              </section>
            ) : (
              points.map((p) => {
                const busy = busyId === p.pointId;
                return (
                  <section key={p.pointId} style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8em', flexWrap: 'wrap', marginBottom: '0.6em' }}>
                      <div style={{ minWidth: 0 }}>
                        <h2 style={{ ...title, margin: 0 }}>{p.name}</h2>
                        <div style={{ color: 'var(--sc-muted)', fontSize: '0.85em', marginTop: '0.2em' }}>
                          {categoryLabel[p.category]}{p.address ? ` · ${p.address}` : ''}
                        </div>
                      </div>
                      <Link href={`/point/${p.pointId}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
                        <Button variant="ghost" style={{ minHeight: '2.2em', fontSize: '0.85em' }}>Переглянути</Button>
                      </Link>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap', marginBottom: '1em' }}>
                      <Pill tone="muted">{verifyStatusLabel[p.verifyStatus] ?? p.verifyStatus}</Pill>
                      <Pill tone={p.verifiedPaid ? 'ok' : 'warn'}>
                        {p.verifiedPaid ? 'Оплачену перевірку підтверджено' : 'Перевірку не оплачено'}
                      </Pill>
                      <Pill tone={p.subscriptionStatus === 'active' ? 'ok' : 'muted'}>
                        {subscriptionStatusLabel[p.subscriptionStatus] ?? p.subscriptionStatus}
                        {p.subscriptionStatus === 'active' && p.subscriptionRenewsAt ? ` до ${fmtDate(p.subscriptionRenewsAt)}` : ''}
                      </Pill>
                    </div>

                    <div style={{ display: 'flex', gap: '0.6em', flexWrap: 'wrap' }}>
                      {!p.verifiedPaid && (
                        <Button onClick={() => onPay(p.pointId)} disabled={busy} style={{ minHeight: '2.4em', fontSize: '0.85em' }}>
                          {busy ? 'Обробка…' : 'Оплатити перевірку'}
                        </Button>
                      )}
                      {p.subscriptionStatus !== 'active' && (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() => onSubscribe(p.pointId, 'monthly')}
                            disabled={busy}
                            style={{ minHeight: '2.4em', fontSize: '0.85em' }}
                          >
                            Підписка: місячна
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => onSubscribe(p.pointId, 'yearly')}
                            disabled={busy}
                            style={{ minHeight: '2.4em', fontSize: '0.85em' }}
                          >
                            Підписка: річна
                          </Button>
                        </>
                      )}
                    </div>
                  </section>
                );
              })
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
