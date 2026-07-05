'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { toast } from '@/lib/toast';
import { subscribeBusiness, type SubscriptionPlan } from '@/lib/business';
import { useBusiness } from '@/lib/businessContext';

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.3em',
} as const;

// Free-tier features intentionally omit any point-count limit — the cap is never
// advertised before it is hit.
const FREE_FEATURES = [
  'Додавання точок на мапу',
  'Показ у пошуку та на мапі',
  'Відгуки відвідувачів',
  'Профіль точки з фото',
];
const BUSINESS_FEATURES = [
  'Усе з базового плану',
  'Необмежена кількість точок',
  'Пріоритет у результатах пошуку',
  'Позначка «Бізнес» на всіх точках',
  'Аналітика переглядів, пошуку та відгуків',
  'Графіки відгуків за день/тиждень/місяць/рік',
  'Поради, як підняти рівень доступності точки',
  'Порівняння доступності із закладами поблизу',
  'Запит на верифікацію точок модератором',
];

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('uk-UA') : '';
}

function StatusStat({ label, children, delay }: { label: string; children: React.ReactNode; delay: number }) {
  return (
    <div className="sc-rise" style={{ background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '1em 1.2em', display: 'flex', flexDirection: 'column', gap: '0.2em', animationDelay: `${delay}ms` }}>
      <div style={{ fontSize: '0.78em', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--sc-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.3em', fontWeight: 800 }}>{children}</div>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', gap: '0.5em', alignItems: 'flex-start', fontSize: '0.88em', lineHeight: 1.4 }}>
      <span aria-hidden style={{ color: 'var(--sc-ok)', fontWeight: 800, flexShrink: 0 }}>✓</span>
      <span>{children}</span>
    </li>
  );
}

function PlanCard({
  title, price, period, note, features, current, highlight, action, delay = 0,
}: {
  title: string; price: string; period?: string; note?: string; features: string[];
  current: boolean; highlight?: boolean; action: React.ReactNode; delay?: number;
}) {
  return (
    <div
      className="sc-rise"
      style={{
        ...card, flex: '1 1 240px', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: '0.2em',
        borderColor: current ? 'var(--sc-ok-line)' : highlight ? 'var(--sc-primary)' : 'var(--sc-border)',
        borderWidth: current || highlight ? '2px' : undefined,
        animationDelay: `${delay}ms`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5em' }}>
        <span style={{ fontWeight: 800, fontSize: '1.05em', minWidth: 0 }}>{title}</span>
        {current && <span style={{ fontSize: '0.72em', fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--sc-ok)', background: 'var(--sc-ok-bg)', border: 'var(--sc-bw) solid var(--sc-ok-line)', borderRadius: '2em', padding: '0.2em 0.6em' }}>Поточний</span>}
      </div>
      <div style={{ margin: '0.15em 0' }}>
        <span style={{ fontSize: '1.7em', fontWeight: 800 }}>{price}</span>
        {period && <span style={{ color: 'var(--sc-muted)', fontWeight: 700 }}>{period}</span>}
      </div>
      <div style={{ color: 'var(--sc-muted)', fontSize: '0.82em', minHeight: '1.1em', marginBottom: '0.8em' }}>{note ?? ''}</div>
      <ul style={{ listStyle: 'none', margin: '0 0 1.1em', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5em', flex: 1 }}>
        {features.map((f) => <Feature key={f}>{f}</Feature>)}
      </ul>
      {action}
    </div>
  );
}

export default function BusinessSubscription() {
  const { me, reload } = useBusiness();
  const [busy, setBusy] = useState<SubscriptionPlan | null>(null);
  const currentPlan: 'free' | SubscriptionPlan = me.isBusiness ? (me.plan ?? 'monthly') : 'free';

  async function pick(plan: SubscriptionPlan) {
    setBusy(plan);
    try {
      await subscribeBusiness(plan);
      await reload();
      toast('Бізнес-підписку активовано.', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Не вдалося оформити підписку', 'error');
    } finally {
      setBusy(null);
    }
  }

  const bizButton = (plan: SubscriptionPlan) =>
    currentPlan === plan ? (
      <Button variant="secondary" block disabled>Активний план</Button>
    ) : (
      <Button onClick={() => pick(plan)} disabled={busy !== null} block variant={plan === 'yearly' ? 'primary' : 'secondary'}>
        {busy === plan ? 'Обробка…' : me.isBusiness ? 'Перейти' : 'Обрати'}
      </Button>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2em' }}>
      <h1 style={{ margin: 0, fontSize: '1.6em', fontWeight: 800 }}>Підписка</h1>

      {me.isBusiness && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.9em' }}>
          <StatusStat label="Статус" delay={0}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', color: 'var(--sc-ok)' }}>
              <span aria-hidden style={{ width: '0.55em', height: '0.55em', borderRadius: '50%', background: 'var(--sc-ok)' }} /> Активна
            </span>
          </StatusStat>
          <StatusStat label="План" delay={70}>{me.plan === 'yearly' ? 'Річна' : 'Місячна'}</StatusStat>
          <StatusStat label="Діє до" delay={140}>{me.renewsAt ? fmtDate(me.renewsAt) : '—'}</StatusStat>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.9em', flexWrap: 'wrap', alignItems: 'stretch' }}>
        <PlanCard
          title="Базовий"
          price="Безкоштовно"
          features={FREE_FEATURES}
          current={currentPlan === 'free'}
          delay={180}
          action={
            currentPlan === 'free'
              ? <Button variant="secondary" block disabled>Ваш план</Button>
              : <span style={{ textAlign: 'center', color: 'var(--sc-muted)', fontSize: '0.82em', padding: '0.6em 0' }}>Входить у бізнес</span>
          }
        />
        <PlanCard
          title="Бізнес · Місячна"
          price="₴199"
          period="/міс"
          note="Оплата щомісяця"
          features={BUSINESS_FEATURES}
          current={currentPlan === 'monthly'}
          delay={250}
          action={bizButton('monthly')}
        />
        <PlanCard
          title="Бізнес · Річна"
          price="₴1990"
          period="/рік"
          note="Два місяці у подарунок"
          features={BUSINESS_FEATURES}
          current={currentPlan === 'yearly'}
          highlight
          delay={320}
          action={bizButton('yearly')}
        />
      </div>
    </div>
  );
}
