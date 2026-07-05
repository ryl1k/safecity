'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, Clock, CircleHelp, Wrench, PartyPopper } from 'lucide-react';
import type { AccessibilityFeature } from '@safecity/shared';
import { accessLevelBreakdown } from '@safecity/shared';
import { Button } from '@/components/ui';
import { categoryLabel } from '@/lib/format';
import { levelLabel, levelColor } from '@/lib/filters';
import { getCatalog } from '@/lib/catalog';
import { toast } from '@/lib/toast';
import { useBusiness } from '@/lib/businessContext';
import { requestPointVerification, type MyPoint } from '@/lib/business';

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.2em 1.3em',
} as const;

type VerifyState = 'verified' | 'requested' | 'none';
function verifyState(p: MyPoint): VerifyState {
  if (p.verifyStatus === 'verified' || p.verifyStatus === 'official') return 'verified';
  if (p.verificationRequestedAt) return 'requested';
  return 'none';
}

// One improvement suggestion row.
function Gap({ label, gain, kind }: { label: string; gain: number; kind: 'easy' | 'hard' }) {
  const Icon = kind === 'easy' ? CircleHelp : Wrench;
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: '0.55em', fontSize: '0.88em', padding: '0.3em 0' }}>
      <Icon size={15} aria-hidden style={{ flexShrink: 0, color: kind === 'easy' ? 'var(--sc-primary)' : 'var(--sc-muted)' }} />
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      <span style={{ flexShrink: 0, fontWeight: 800, color: 'var(--sc-ok)' }}>+{Math.round(gain)}</span>
    </li>
  );
}

export default function BusinessAccessibility() {
  const { me, reload } = useBusiness();
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => { void getCatalog().then(setCatalog).catch(() => {}); }, []);

  const labelOf = (key: string) => catalog.find((f) => f.key === key)?.label ?? key;

  async function askVerify(id: string) {
    setBusyId(id);
    try {
      await requestPointVerification(id);
      await reload();
      toast('Запит на верифікацію надіслано модератору.', 'success');
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Не вдалося надіслати запит', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2em' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.6em', fontWeight: 800 }}>Доступність і верифікація</h1>
        <p style={{ margin: '0.3em 0 0', color: 'var(--sc-muted)', fontSize: '0.92em' }}>
          Що зробити, щоб підняти рівень доступності точки, і як підтвердити дані модератором.
        </p>
      </div>

      {me.points.length === 0 ? (
        <section style={card}><p style={{ margin: 0, color: 'var(--sc-muted)' }}>У вас ще немає точок.</p></section>
      ) : (
        me.points.map((p) => {
          const bd = catalog.length ? accessLevelBreakdown(p.features, catalog, p.category) : null;
          const vs = verifyState(p);
          const easy = (bd?.gaps ?? []).filter((g) => g.value === 'unknown').slice(0, 3);
          const hard = (bd?.gaps ?? []).filter((g) => g.value === 'no').slice(0, 3);
          return (
            <section key={p.id} style={card}>
              {/* Header: name + current level */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8em', flexWrap: 'wrap', alignItems: 'baseline', marginBottom: '0.9em' }}>
                <Link href={`/point/${p.id}`} style={{ minWidth: 0, textDecoration: 'none', color: 'var(--sc-text)' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ color: 'var(--sc-muted)', fontSize: '0.82em' }}>{categoryLabel[p.category as keyof typeof categoryLabel] ?? p.category}</div>
                </Link>
                {bd && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', fontWeight: 800, color: levelColor[bd.level], flexShrink: 0 }}>
                    <span aria-hidden style={{ width: '0.6em', height: '0.6em', borderRadius: '50%', background: levelColor[bd.level] }} />
                    {levelLabel[bd.level]}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.1em' }}>
                {/* Accessibility improvement (level = how accessible) */}
                <div>
                  <div style={{ fontSize: '0.78em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--sc-muted)', marginBottom: '0.5em' }}>Рівень доступності</div>
                  {!bd ? (
                    <p style={{ margin: 0, color: 'var(--sc-muted)', fontSize: '0.88em' }}>Немає критеріїв для цієї категорії.</p>
                  ) : bd.level === 'high' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', color: 'var(--sc-ok)', fontWeight: 700, fontSize: '0.9em' }}>
                      <PartyPopper size={17} aria-hidden /> Максимальний рівень доступності
                    </div>
                  ) : (
                    <>
                      <p style={{ margin: '0 0 0.6em', fontSize: '0.9em' }}>
                        До <strong style={{ color: 'var(--sc-ok)' }}>високого</strong> рівня — ще <strong>{bd.toHigh}</strong> балів зі 100.
                      </p>
                      {easy.length > 0 && (
                        <>
                          <div style={{ fontSize: '0.8em', fontWeight: 700, color: 'var(--sc-primary)', margin: '0.3em 0 0.1em' }}>Найлегше — просто підтвердити:</div>
                          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {easy.map((g) => <Gap key={g.key} label={labelOf(g.key)} gain={g.gain} kind="easy" />)}
                          </ul>
                        </>
                      )}
                      {hard.length > 0 && (
                        <>
                          <div style={{ fontSize: '0.8em', fontWeight: 700, color: 'var(--sc-muted)', margin: '0.5em 0 0.1em' }}>Найбільший вплив — потребує змін:</div>
                          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {hard.map((g) => <Gap key={g.key} label={labelOf(g.key)} gain={g.gain} kind="hard" />)}
                          </ul>
                        </>
                      )}
                      <p style={{ margin: '0.6em 0 0', fontSize: '0.75em', color: 'var(--sc-muted)' }}>
                        Числа — приріст до оцінки доступності. <Link href={`/point/${p.id}/edit`} style={{ color: 'var(--sc-primary)', fontWeight: 700, textDecoration: 'none' }}>Оновити критерії →</Link>
                      </p>
                    </>
                  )}
                </div>

                {/* Verification (data confirmed by a moderator — separate from level) */}
                <div>
                  <div style={{ fontSize: '0.78em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--sc-muted)', marginBottom: '0.5em' }}>Верифікація</div>
                  {vs === 'verified' ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45em', color: 'var(--sc-ok)', fontWeight: 800, background: 'var(--sc-ok-bg)', border: 'var(--sc-bw) solid var(--sc-ok-line)', borderRadius: '2em', padding: '0.35em 0.8em', fontSize: '0.85em' }}>
                      <ShieldCheck size={16} aria-hidden /> Перевірено
                    </div>
                  ) : vs === 'requested' ? (
                    <div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45em', color: 'var(--sc-warn, var(--sc-muted))', fontWeight: 700, fontSize: '0.88em' }}>
                        <Clock size={16} aria-hidden /> Запит на розгляді
                      </div>
                      <p style={{ margin: '0.4em 0 0', fontSize: '0.8em', color: 'var(--sc-muted)' }}>Модератор перевірить дані та підтвердить точку.</p>
                    </div>
                  ) : (
                    <div>
                      <p style={{ margin: '0 0 0.7em', fontSize: '0.88em', color: 'var(--sc-muted)' }}>
                        Підтвердьте достовірність даних — верифіковані точки викликають більше довіри.
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() => askVerify(p.id)}
                        disabled={busyId === p.id}
                        style={{ minHeight: '2.4em', fontSize: '0.86em' }}
                      >
                        {busyId === p.id ? 'Надсилання…' : 'Запросити верифікацію'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
