'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, Clock, CircleHelp, Wrench, PartyPopper, Check, X, HelpCircle } from 'lucide-react';
import type { AccessibilityFeature, AccessLevel, CriterionState, FeatureValue, LevelBreakdown } from '@safecity/shared';
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
  borderRadius: '1em', padding: '1.2em 1.3em', display: 'flex', flexDirection: 'column', gap: '0.7em',
} as const;

const sectionLabel = {
  fontSize: '0.72em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sc-muted)',
} as const;

// Status colour reuses the level palette so a criterion's colour matches the badge.
const valueColor: Record<FeatureValue, string> = { yes: levelColor.high, unknown: levelColor.medium, no: levelColor.low };

type VerifyState = 'verified' | 'requested' | 'none';
function verifyState(p: MyPoint): VerifyState {
  if (p.verifyStatus === 'verified' || p.verifyStatus === 'official') return 'verified';
  if (p.verificationRequestedAt) return 'requested';
  return 'none';
}

// ── Score gauge ────────────────────────────────────────────────────────────
function ScoreGauge({ score, color, size = 132, stroke = 12 }: { score: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, score / 100));
  const dash = c * frac;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Оцінка ${score} зі 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sc-surface-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: size * 0.3, fontWeight: 800, fill: 'var(--sc-text)' }}>{score}</text>
      <text x="50%" y="65%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: size * 0.11, fontWeight: 700, fill: 'var(--sc-muted)' }}>зі 100</text>
    </svg>
  );
}

const BANDS: { level: AccessLevel; range: string }[] = [
  { level: 'high', range: '75–100' },
  { level: 'medium', range: '51–74' },
  { level: 'low', range: '0–50' },
];

function ScoreCard({ bd }: { bd: LevelBreakdown }) {
  return (
    <section style={{ ...card, alignItems: 'center', textAlign: 'center' }}>
      <div style={sectionLabel}>Оцінка доступності</div>
      <ScoreGauge score={bd.score} color={levelColor[bd.level]} />
      <div style={{ fontWeight: 800, fontSize: '1.05em', color: levelColor[bd.level] }}>{levelLabel[bd.level]}</div>
      {bd.level !== 'high' ? (
        <div style={{ fontSize: '0.85em', color: 'var(--sc-muted)' }}>
          До <strong style={{ color: 'var(--sc-ok)' }}>високого</strong> — ще <strong style={{ color: 'var(--sc-text)' }}>{bd.toHigh}</strong> балів
        </div>
      ) : (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', color: 'var(--sc-ok)', fontWeight: 700, fontSize: '0.85em' }}>
          <PartyPopper size={15} aria-hidden /> Максимальний рівень
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25em', width: '100%', marginTop: '0.2em' }}>
        {BANDS.map((b) => (
          <div key={b.level} style={{ display: 'flex', alignItems: 'center', gap: '0.45em', fontSize: '0.76em', fontWeight: b.level === bd.level ? 800 : 600, opacity: b.level === bd.level ? 1 : 0.6 }}>
            <span aria-hidden style={{ width: '0.6em', height: '0.6em', borderRadius: '50%', background: levelColor[b.level] }} />
            <span style={{ color: 'var(--sc-text)' }}>{levelLabel[b.level]}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--sc-muted)' }}>{b.range}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── What to improve ─────────────────────────────────────────────────────────
function GapRow({ label, gain, kind }: { label: string; gain: number; kind: 'easy' | 'hard' }) {
  const Icon = kind === 'easy' ? CircleHelp : Wrench;
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: '0.55em', fontSize: '0.9em', padding: '0.32em 0' }}>
      <Icon size={16} aria-hidden style={{ flexShrink: 0, color: kind === 'easy' ? 'var(--sc-primary)' : 'var(--sc-muted)' }} />
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      <span style={{ flexShrink: 0, fontWeight: 800, color: 'var(--sc-ok)' }}>+{Math.round(gain)}</span>
    </li>
  );
}

function ImprovementCard({ bd, labelOf, editHref }: { bd: LevelBreakdown; labelOf: (k: string) => string; editHref: string }) {
  const easy = bd.gaps.filter((g) => g.value === 'unknown');
  const hard = bd.gaps.filter((g) => g.value === 'no');
  return (
    <section style={{ ...card, gridColumn: 'span 2' }}>
      <div style={sectionLabel}>Що покращити</div>
      {bd.gaps.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--sc-muted)', fontSize: '0.9em' }}>Усі критерії підтверджено — точка вже має максимальний рівень.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6em 1.4em' }}>
          {easy.length > 0 && (
            <div>
              <div style={{ fontSize: '0.82em', fontWeight: 800, color: 'var(--sc-primary)', marginBottom: '0.2em', display: 'flex', alignItems: 'center', gap: '0.4em' }}>
                <CircleHelp size={15} aria-hidden /> Найлегше — просто підтвердити
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {easy.map((g) => <GapRow key={g.key} label={labelOf(g.key)} gain={g.gain} kind="easy" />)}
              </ul>
            </div>
          )}
          {hard.length > 0 && (
            <div>
              <div style={{ fontSize: '0.82em', fontWeight: 800, color: 'var(--sc-muted)', marginBottom: '0.2em', display: 'flex', alignItems: 'center', gap: '0.4em' }}>
                <Wrench size={15} aria-hidden /> Найбільший вплив — потребує змін
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {hard.map((g) => <GapRow key={g.key} label={labelOf(g.key)} gain={g.gain} kind="hard" />)}
              </ul>
            </div>
          )}
        </div>
      )}
      <p style={{ margin: '0.2em 0 0', fontSize: '0.76em', color: 'var(--sc-muted)' }}>
        Числа — приріст до оцінки. <Link href={editHref} style={{ color: 'var(--sc-primary)', fontWeight: 700, textDecoration: 'none' }}>Оновити критерії →</Link>
      </p>
    </section>
  );
}

// ── Verification ────────────────────────────────────────────────────────────
function VerificationCard({ state, busy, onRequest }: { state: VerifyState; busy: boolean; onRequest: () => void }) {
  return (
    <section style={card}>
      <div style={sectionLabel}>Верифікація</div>
      {state === 'verified' ? (
        <>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45em', color: 'var(--sc-ok)', fontWeight: 800, background: 'var(--sc-ok-bg)', border: 'var(--sc-bw) solid var(--sc-ok-line)', borderRadius: '2em', padding: '0.4em 0.9em', fontSize: '0.9em', alignSelf: 'flex-start' }}>
            <ShieldCheck size={17} aria-hidden /> Перевірено
          </div>
          <p style={{ margin: 0, fontSize: '0.85em', color: 'var(--sc-muted)' }}>Модератор підтвердив дані цієї точки.</p>
        </>
      ) : state === 'requested' ? (
        <>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45em', color: levelColor.medium, fontWeight: 700, fontSize: '0.9em' }}>
            <Clock size={17} aria-hidden /> Запит на розгляді
          </div>
          <p style={{ margin: 0, fontSize: '0.85em', color: 'var(--sc-muted)' }}>Модератор перевірить дані та підтвердить точку.</p>
        </>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: '0.88em', color: 'var(--sc-muted)' }}>
            Підтвердьте достовірність даних — верифіковані точки викликають більше довіри у відвідувачів.
          </p>
          <Button variant="secondary" onClick={onRequest} disabled={busy} style={{ minHeight: '2.5em', fontSize: '0.88em', alignSelf: 'flex-start' }}>
            {busy ? 'Надсилання…' : 'Запросити верифікацію'}
          </Button>
        </>
      )}
    </section>
  );
}

// ── Score composition (full width) ──────────────────────────────────────────
const valueIcon = { yes: Check, unknown: HelpCircle, no: X } as const;

function CriteriaRow({ c, label }: { c: CriterionState; label: string }) {
  const Icon = valueIcon[c.value];
  const color = valueColor[c.value];
  const fillPct = c.weight > 0 ? (c.earned / c.weight) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', padding: '0.45em 0', borderTop: 'var(--sc-bw) solid var(--sc-border)' }}>
      <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: '1.5em', height: '1.5em', borderRadius: '50%', flexShrink: 0, background: color, color: '#fff' }}>
        <Icon size={13} strokeWidth={3} />
      </span>
      <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: '0.9em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4em' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {c.critical && <span title="Ключовий критерій" style={{ color: 'var(--sc-accent)', flexShrink: 0 }}>★</span>}
      </span>
      <div style={{ flex: '2 1 120px', height: '0.55em', borderRadius: '1em', background: 'var(--sc-surface-2)', overflow: 'hidden', minWidth: 60 }}>
        <div style={{ width: `${fillPct}%`, height: '100%', background: color, borderRadius: '1em' }} />
      </div>
      <span style={{ flexShrink: 0, width: '4.5em', textAlign: 'right', fontSize: '0.82em', fontWeight: 700, color: 'var(--sc-muted)' }}>
        <span style={{ color: 'var(--sc-text)' }}>{Math.round(c.earned)}</span>/{Math.round(c.weight)}
      </span>
    </div>
  );
}

function CompositionCard({ bd, labelOf }: { bd: LevelBreakdown; labelOf: (k: string) => string }) {
  return (
    <section style={{ ...card, gap: '0.3em' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.4em', marginBottom: '0.3em' }}>
        <div style={sectionLabel}>З чого складається оцінка</div>
        <div style={{ fontSize: '0.8em', color: 'var(--sc-muted)' }}>
          Набрано <strong style={{ color: 'var(--sc-text)' }}>{bd.score}</strong> зі 100 балів
        </div>
      </div>
      <div style={{ display: 'flex', gap: '1.1em', flexWrap: 'wrap', fontSize: '0.74em', color: 'var(--sc-muted)', marginBottom: '0.2em' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}><span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: valueColor.yes }} /> Є</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}><span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: valueColor.unknown }} /> Невідомо (пів бала)</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}><span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: valueColor.no }} /> Немає</span>
      </div>
      {bd.criteria.map((c) => <CriteriaRow key={c.key} c={c} label={labelOf(c.key)} />)}
    </section>
  );
}

// ── Per-point block ─────────────────────────────────────────────────────────
function PointBlock({ p, catalog, busy, onRequest }: { p: MyPoint; catalog: AccessibilityFeature[]; busy: boolean; onRequest: () => void }) {
  const bd = catalog.length ? accessLevelBreakdown(p.features, catalog, p.category) : null;
  const vs = verifyState(p);
  const labelOf = (key: string) => catalog.find((f) => f.key === key)?.label ?? key;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '0.9em' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.8em', flexWrap: 'wrap' }}>
        <Link href={`/point/${p.id}`} style={{ minWidth: 0, textDecoration: 'none', color: 'var(--sc-text)' }}>
          <h2 style={{ margin: 0, fontSize: '1.25em', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</h2>
          <div style={{ color: 'var(--sc-muted)', fontSize: '0.85em' }}>{categoryLabel[p.category as keyof typeof categoryLabel] ?? p.category}</div>
        </Link>
        {bd && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45em', fontWeight: 800, color: levelColor[bd.level], border: `var(--sc-bw) solid ${levelColor[bd.level]}`, borderRadius: '2em', padding: '0.3em 0.9em', flexShrink: 0 }}>
            <span aria-hidden style={{ width: '0.65em', height: '0.65em', borderRadius: '50%', background: levelColor[bd.level] }} />
            {levelLabel[bd.level]}
          </span>
        )}
      </div>

      {!bd ? (
        <section style={card}><p style={{ margin: 0, color: 'var(--sc-muted)' }}>Немає критеріїв доступності для цієї категорії.</p></section>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1em', alignItems: 'stretch' }} className="sc-a11y-grid">
            <ScoreCard bd={bd} />
            <ImprovementCard bd={bd} labelOf={labelOf} editHref={`/point/${p.id}/edit`} />
            <VerificationCard state={vs} busy={busy} onRequest={onRequest} />
          </div>
          <CompositionCard bd={bd} labelOf={labelOf} />
        </>
      )}
    </section>
  );
}

export default function BusinessAccessibility() {
  const { me, reload } = useBusiness();
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => { void getCatalog().then(setCatalog).catch(() => {}); }, []);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.8em' }}>
      {/* Grid collapses to a single column below ~880px so the cards never squash. */}
      <style>{`@media (max-width: 880px){ .sc-a11y-grid{ grid-template-columns: 1fr !important; } }`}</style>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.6em', fontWeight: 800 }}>Доступність і верифікація</h1>
        <p style={{ margin: '0.3em 0 0', color: 'var(--sc-muted)', fontSize: '0.92em' }}>
          Ваша оцінка доступності, що покращити найперше, і як підтвердити дані модератором.
        </p>
      </div>

      {me.points.length === 0 ? (
        <section style={card}><p style={{ margin: 0, color: 'var(--sc-muted)' }}>У вас ще немає точок.</p></section>
      ) : (
        me.points.map((p) => (
          <PointBlock key={p.id} p={p} catalog={catalog} busy={busyId === p.id} onRequest={() => askVerify(p.id)} />
        ))
      )}
    </div>
  );
}
