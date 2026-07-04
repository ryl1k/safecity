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

const PERKS = [
  'Необмежена кількість точок',
  'Пріоритет у результатах пошуку',
  'Позначка «Бізнес» на всіх ваших точках',
  'Доступ до аналітики переглядів',
];

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('uk-UA') : '';
}

function PlanCard({ title, price, note, onPick, busy, highlight }: {
  title: string; price: string; note: string; onPick: () => void; busy: boolean; highlight?: boolean;
}) {
  return (
    <div style={{ ...card, flex: '1 1 220px', borderColor: highlight ? 'var(--sc-primary)' : 'var(--sc-border)' }}>
      <div style={{ fontWeight: 800, fontSize: '1.05em' }}>{title}</div>
      <div style={{ fontSize: '1.9em', fontWeight: 800, margin: '0.2em 0' }}>{price}</div>
      <div style={{ color: 'var(--sc-muted)', fontSize: '0.85em', marginBottom: '1em' }}>{note}</div>
      <Button onClick={onPick} disabled={busy} variant={highlight ? 'primary' : 'secondary'} block>
        {busy ? 'Обробка…' : 'Обрати'}
      </Button>
    </div>
  );
}

export default function BusinessSubscription() {
  const { me, reload } = useBusiness();
  const [busy, setBusy] = useState(false);

  async function pick(plan: SubscriptionPlan) {
    setBusy(true);
    try {
      await subscribeBusiness(plan);
      await reload();
      toast('Бізнес-підписку активовано.', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Не вдалося оформити підписку', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2em' }}>
      <h1 style={{ margin: 0, fontSize: '1.6em', fontWeight: 800 }}>Підписка</h1>

      {me.isBusiness && (
        <section style={{ ...card, borderColor: 'var(--sc-ok-line)', background: 'var(--sc-ok-bg)' }}>
          <div style={{ fontWeight: 800, color: 'var(--sc-ok)' }}>Активна · {me.plan === 'yearly' ? 'Річна' : 'Місячна'}</div>
          <p style={{ margin: '0.3em 0 0', color: 'var(--sc-muted)', fontSize: '0.9em' }}>
            {me.renewsAt ? `Наступне поновлення ${fmtDate(me.renewsAt)}.` : ''} Оберіть інший план нижче, щоб змінити його.
          </p>
        </section>
      )}

      <section style={card}>
        <div style={{ fontWeight: 800, marginBottom: '0.6em' }}>Що входить у бізнес</div>
        <ul style={{ margin: 0, paddingLeft: '1.2em', color: 'var(--sc-muted)', fontSize: '0.9em', lineHeight: 1.7 }}>
          {PERKS.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </section>

      <div style={{ display: 'flex', gap: '0.9em', flexWrap: 'wrap' }}>
        <PlanCard title="Місячна" price="₴199/міс" note="Оплата щомісяця" onPick={() => pick('monthly')} busy={busy} />
        <PlanCard title="Річна" price="₴1990/рік" note="Два місяці у подарунок" onPick={() => pick('yearly')} busy={busy} highlight />
      </div>

      <p style={{ margin: 0, fontSize: '0.78em', color: 'var(--sc-muted)' }}>
        Оплата зараз мокована — активація миттєва, без реального процесингу.
      </p>
    </div>
  );
}
