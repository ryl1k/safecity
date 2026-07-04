'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { Button, LoadingState, ErrorState } from '@/components/ui';
import { categoryLabel } from '@/lib/format';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { deletePoint } from '@/lib/points';
import { businessMe, subscribeBusiness, type BusinessMe, type SubscriptionPlan } from '@/lib/business';

type Gate = 'loading' | 'guest' | 'ok' | 'error';

const verifyLabel: Record<string, { label: string; tone: 'ok' | 'muted' }> = {
  unverified: { label: 'Не перевірено', tone: 'muted' },
  verified: { label: 'Перевірено', tone: 'ok' },
  official: { label: 'Офіційно', tone: 'ok' },
};

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.2em 1.3em',
} as const;

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('uk-UA') : '';
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{ ...card, padding: '1em 1.2em' }}>
      <div style={{ fontSize: '0.78em', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--sc-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.7em', fontWeight: 800, marginTop: '0.15em', color: accent ? 'var(--sc-primary)' : 'var(--sc-text)' }}>{value}</div>
    </div>
  );
}

export default function BusinessPage() {
  const [gate, setGate] = useState<Gate>('loading');
  const [me, setMe] = useState<BusinessMe | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setGate('loading');
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setGate('guest'); return; }
      setMe(await businessMe());
      setGate('ok');
    } catch {
      setGate('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function onSubscribe(plan: SubscriptionPlan) {
    setBusy(true);
    try {
      await subscribeBusiness(plan);
      setMe(await businessMe());
      toast('Бізнес-підписку активовано — точки без обмежень.', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Не вдалося оформити підписку', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Видалити цю точку? Дію не можна скасувати.')) return;
    setBusyId(id);
    try {
      await deletePoint(id);
      setMe(await businessMe());
      toast('Точку видалено.', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Не вдалося видалити', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const points = me?.points ?? [];
  const totalViews = points.reduce((s, p) => s + p.viewCount, 0);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="business" />
      <main id="main-content" tabIndex={-1} style={{ width: '100%', maxWidth: 'min(100%, 900px)', margin: '0 auto', padding: '1.6em 1.25em 4em' }}>
        <h1 style={{ margin: '0 0 1em', fontSize: '1.8em', fontWeight: 800 }}>Панель бізнесу</h1>

        {gate === 'loading' && <LoadingState label="Завантаження панелі" />}
        {gate === 'error' && <ErrorState onRetry={() => void load()} />}

        {gate === 'guest' && (
          <section style={card}>
            <p style={{ margin: '0 0 1em' }}>Увійдіть, щоб керувати своїми точками та бізнес-акаунтом.</p>
            <Link href="/auth?next=/business" style={{ textDecoration: 'none' }}><Button>Увійти</Button></Link>
          </section>
        )}

        {gate === 'ok' && me && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2em' }}>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.9em' }}>
              <Stat label="Точок" value={points.length} />
              <Stat label="Переглядів" value={totalViews} accent />
              <Stat label="Статус" value={me.isBusiness ? 'Бізнес' : 'Базовий'} accent={me.isBusiness} />
              {me.isBusiness && <Stat label="Підписка" value={me.plan === 'yearly' ? 'Річна' : 'Місячна'} />}
            </div>

            {/* Account / upgrade */}
            {me.isBusiness ? (
              <section style={{ ...card, borderColor: 'var(--sc-ok-line)', background: 'var(--sc-ok-bg)' }}>
                <div style={{ fontWeight: 800, color: 'var(--sc-ok)', marginBottom: '0.3em' }}>Бізнес-акаунт активний</div>
                <p style={{ margin: 0, color: 'var(--sc-muted)', fontSize: '0.9em' }}>
                  Необмежена кількість точок, пріоритет у пошуку та позначка бізнесу на всіх ваших точках.
                  {me.renewsAt ? ` Діє до ${fmtDate(me.renewsAt)}.` : ''}
                </p>
              </section>
            ) : (
              <section style={card}>
                <div style={{ fontWeight: 800, marginBottom: '0.3em' }}>Станьте бізнесом</div>
                <p style={{ margin: '0 0 1em', color: 'var(--sc-muted)', fontSize: '0.9em' }}>
                  Необмежена кількість точок, пріоритет у результатах пошуку та позначка бізнесу на всіх ваших точках.
                </p>
                <div style={{ display: 'flex', gap: '0.6em', flexWrap: 'wrap' }}>
                  <Button onClick={() => onSubscribe('monthly')} disabled={busy}>{busy ? 'Обробка…' : 'Місячна підписка'}</Button>
                  <Button variant="secondary" onClick={() => onSubscribe('yearly')} disabled={busy}>{busy ? 'Обробка…' : 'Річна підписка'}</Button>
                </div>
              </section>
            )}

            {/* Points */}
            <section style={{ ...card, padding: '0.4em 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8em 1.3em', flexWrap: 'wrap', gap: '0.6em' }}>
                <h2 style={{ margin: 0, fontSize: '1.1em', fontWeight: 800 }}>Мої точки</h2>
                <Link href="/contribute" style={{ textDecoration: 'none' }}>
                  <Button variant="secondary" style={{ minHeight: '2.3em', fontSize: '0.85em' }}>+ Додати точку</Button>
                </Link>
              </div>

              {points.length === 0 ? (
                <p style={{ margin: 0, padding: '0.4em 1.3em 1.2em', color: 'var(--sc-muted)' }}>Ви ще не додали жодної точки.</p>
              ) : (
                points.map((p) => {
                  const v = verifyLabel[p.verifyStatus] ?? { label: p.verifyStatus, tone: 'muted' as const };
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.8em', flexWrap: 'wrap',
                        padding: '0.9em 1.3em', borderTop: 'var(--sc-bw) solid var(--sc-border)',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                        <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ color: 'var(--sc-muted)', fontSize: '0.82em', marginTop: '0.15em' }}>
                          {categoryLabel[p.category as keyof typeof categoryLabel] ?? p.category}
                          {p.address ? ` · ${p.address}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9em', fontSize: '0.85em' }}>
                        <span title="Перегляди" style={{ color: 'var(--sc-muted)', fontWeight: 700 }}>👁 {p.viewCount}</span>
                        <span style={{ color: v.tone === 'ok' ? 'var(--sc-ok)' : 'var(--sc-muted)', fontWeight: 700 }}>{v.label}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4em', flexWrap: 'wrap' }}>
                        <Link href={`/point/${p.id}`} style={{ textDecoration: 'none' }}>
                          <Button variant="ghost" style={{ minHeight: '2.1em', fontSize: '0.82em', padding: '0 0.7em' }}>Переглянути</Button>
                        </Link>
                        <Link href={`/point/${p.id}/edit`} style={{ textDecoration: 'none' }}>
                          <Button variant="secondary" style={{ minHeight: '2.1em', fontSize: '0.82em', padding: '0 0.7em' }}>Редагувати</Button>
                        </Link>
                        <button
                          type="button"
                          className="sc-foc"
                          onClick={() => onDelete(p.id)}
                          disabled={busyId === p.id}
                          aria-label={`Видалити ${p.name}`}
                          style={{
                            minHeight: '2.1em', padding: '0 0.7em', borderRadius: '0.5em', cursor: 'pointer',
                            fontFamily: 'inherit', fontWeight: 700, fontSize: '0.82em',
                            border: 'var(--sc-bw) solid var(--sc-bad)', background: 'transparent', color: 'var(--sc-bad)',
                          }}
                        >
                          {busyId === p.id ? '…' : 'Видалити'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
