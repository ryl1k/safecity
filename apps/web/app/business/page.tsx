'use client';

import Link from 'next/link';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui';
import { useBusiness } from '@/lib/businessContext';

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.2em 1.3em',
} as const;

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{ ...card, padding: '1em 1.2em' }}>
      <div style={{ fontSize: '0.78em', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--sc-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.7em', fontWeight: 800, marginTop: '0.15em', color: accent ? 'var(--sc-primary)' : 'var(--sc-text)' }}>{value}</div>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('uk-UA') : '';
}

export default function BusinessOverview() {
  const { me } = useBusiness();
  const totalViews = me.points.reduce((s, p) => s + p.viewCount, 0);
  const mostViewed = [...me.points].sort((a, b) => b.viewCount - a.viewCount)[0];

  return (
    <div className="sc-stagger" style={{ display: 'flex', flexDirection: 'column', gap: '1.2em' }}>
      <h1 style={{ margin: 0, fontSize: '1.6em', fontWeight: 800 }}>Огляд</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.9em' }}>
        <Stat label="Точок" value={me.points.length} />
        <Stat label="Переглядів" value={totalViews} accent />
        <Stat label="Статус" value={me.isBusiness ? 'Бізнес' : 'Базовий'} accent={me.isBusiness} />
        {me.isBusiness && <Stat label="Підписка" value={me.plan === 'yearly' ? 'Річна' : 'Місячна'} />}
      </div>

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
            Необмежена кількість точок, пріоритет у пошуку, аналітика та графіки відгуків,
            поради з доступності, порівняння із закладами поблизу та верифікація.
          </p>
          <Link href="/business/subscription" style={{ textDecoration: 'none' }}>
            <Button>Оформити підписку</Button>
          </Link>
        </section>
      )}

      {mostViewed && mostViewed.viewCount > 0 && (
        <section style={card}>
          <div style={{ fontSize: '0.78em', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--sc-muted)', marginBottom: '0.35em' }}>Найпопулярніша точка</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8em', flexWrap: 'wrap', alignItems: 'baseline' }}>
            <strong style={{ fontSize: '1.05em' }}>{mostViewed.name}</strong>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3em', color: 'var(--sc-primary)', fontWeight: 800 }}><Eye size={17} aria-hidden /> {mostViewed.viewCount}</span>
          </div>
          <Link href="/business/analytics" style={{ color: 'var(--sc-primary)', fontWeight: 700, fontSize: '0.88em', textDecoration: 'none' }}>Уся аналітика →</Link>
        </section>
      )}
    </div>
  );
}
