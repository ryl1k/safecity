'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, Clock, CircleHelp, Wrench, PartyPopper, Check, X, HelpCircle, ChevronDown } from 'lucide-react';
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

// ── Point selector ──────────────────────────────────────────────────────────
function PointSelect({ points, value, onChange }: { points: MyPoint[]; value: string; onChange: (id: string) => void }) {
  const sel = points.find((p) => p.id === value) ?? points[0];
  const category = sel ? categoryLabel[sel.category as keyof typeof categoryLabel] ?? sel.category : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25em', justifyContent: 'center', flexShrink: 0, minWidth: 0 }}>
      {points.length > 1 ? (
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <select
            aria-label="Оберіть точку"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="sc-foc"
            style={{
              appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
              border: 'var(--sc-bw) solid var(--sc-border-strong)', background: 'var(--sc-surface)', color: 'var(--sc-text)',
              fontWeight: 800, fontSize: '1.2em', fontFamily: 'inherit', padding: '0.3em 2.1em 0.3em 0.7em', borderRadius: '0.6em',
              cursor: 'pointer', maxWidth: 300, textOverflow: 'ellipsis',
            }}
          >
            {points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={17} aria-hidden style={{ position: 'absolute', right: '0.6em', pointerEvents: 'none', color: 'var(--sc-muted)' }} />
        </div>
      ) : (
        <h2 style={{ margin: 0, fontSize: '1.25em', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sel?.name}</h2>
      )}
      <span style={{ color: 'var(--sc-muted)', fontSize: '0.85em', paddingLeft: points.length > 1 ? '0.15em' : 0 }}>{category}</span>
    </div>
  );
}

// ── Verification (wide horizontal bar in the header) ────────────────────────
function VerificationBar({ state, busy, onRequest }: { state: VerifyState; busy: boolean; onRequest: () => void }) {
  return (
    <section className="sc-rise" style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: '1.1em', flexWrap: 'wrap', padding: '1em 1.3em' }}>
      <div style={{ ...sectionLabel, flexShrink: 0 }}>Верифікація</div>
      {state === 'verified' ? (
        <>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', color: 'var(--sc-ok)', fontWeight: 800, background: 'var(--sc-ok-bg)', border: 'var(--sc-bw) solid var(--sc-ok-line)', borderRadius: '2em', padding: '0.35em 0.85em', fontSize: '0.88em', flexShrink: 0 }}>
            <ShieldCheck size={16} aria-hidden /> Перевірено
          </span>
          <span style={{ flex: '1 1 160px', minWidth: 0, color: 'var(--sc-muted)', fontSize: '0.88em' }}>Модератор підтвердив дані цієї точки.</span>
        </>
      ) : state === 'requested' ? (
        <>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', color: levelColor.medium, fontWeight: 700, fontSize: '0.9em', flexShrink: 0 }}>
            <Clock size={16} aria-hidden /> Запит на розгляді
          </span>
          <span style={{ flex: '1 1 160px', minWidth: 0, color: 'var(--sc-muted)', fontSize: '0.88em' }}>Модератор перевірить дані та підтвердить точку.</span>
        </>
      ) : (
        <>
          <span style={{ flex: '1 1 220px', minWidth: 0, color: 'var(--sc-muted)', fontSize: '0.9em' }}>
            Підтвердьте достовірність даних — верифіковані точки викликають більше довіри у відвідувачів.
          </span>
          <Button variant="secondary" onClick={onRequest} disabled={busy} style={{ minHeight: '2.5em', fontSize: '0.88em', flexShrink: 0 }}>
            {busy ? 'Надсилання…' : 'Запросити верифікацію'}
          </Button>
        </>
      )}
    </section>
  );
}

// ── Score gauge ────────────────────────────────────────────────────────────
function ScoreGauge({ score, color, size = 138, stroke = 13 }: { score: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, score / 100));
  const dash = c * frac;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Оцінка ${score} зі 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sc-surface-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="sc-gauge-arc"
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

function ScoreCard({ bd, delay }: { bd: LevelBreakdown; delay: number }) {
  return (
    <section className="sc-rise" style={{ ...card, alignItems: 'center', textAlign: 'center', animationDelay: `${delay}ms` }}>
      <div style={sectionLabel}>Оцінка доступності</div>
      <ScoreGauge score={bd.score} color={levelColor[bd.level]} />
      <div style={{ fontWeight: 800, fontSize: '1.1em', color: levelColor[bd.level] }}>{levelLabel[bd.level]}</div>
      {bd.level !== 'high' ? (
        <div style={{ fontSize: '0.85em', color: 'var(--sc-muted)' }}>
          До <strong style={{ color: 'var(--sc-ok)' }}>високого</strong> — ще <strong style={{ color: 'var(--sc-text)' }}>{bd.toHigh}</strong> балів
        </div>
      ) : (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em', color: 'var(--sc-ok)', fontWeight: 700, fontSize: '0.85em' }}>
          <PartyPopper size={15} aria-hidden /> Максимальний рівень
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3em', width: '100%', marginTop: '0.3em' }}>
        {BANDS.map((b) => (
          <div key={b.level} style={{ display: 'flex', alignItems: 'center', gap: '0.45em', fontSize: '0.78em', fontWeight: b.level === bd.level ? 800 : 600, opacity: b.level === bd.level ? 1 : 0.6 }}>
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
    <li style={{ display: 'flex', alignItems: 'center', gap: '0.55em', fontSize: '0.9em', padding: '0.34em 0' }}>
      <Icon size={16} aria-hidden style={{ flexShrink: 0, color: kind === 'easy' ? 'var(--sc-primary)' : 'var(--sc-muted)' }} />
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      <span style={{ flexShrink: 0, fontWeight: 800, color: 'var(--sc-ok)' }}>+{Math.round(gain)}</span>
    </li>
  );
}

function ImprovementCard({ bd, labelOf, editHref, delay }: { bd: LevelBreakdown; labelOf: (k: string) => string; editHref: string; delay: number }) {
  const easy = bd.gaps.filter((g) => g.value === 'unknown');
  const hard = bd.gaps.filter((g) => g.value === 'no');
  return (
    <section className="sc-rise" style={{ ...card, animationDelay: `${delay}ms` }}>
      <div style={sectionLabel}>Що покращити</div>
      {bd.gaps.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--sc-muted)', fontSize: '0.9em' }}>Усі критерії підтверджено — точка вже має максимальний рівень.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.6em 1.6em' }}>
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
        <div className="sc-bar-fill" style={{ width: `${fillPct}%`, height: '100%', background: color, borderRadius: '1em' }} />
      </div>
      <span style={{ flexShrink: 0, width: '4.5em', textAlign: 'right', fontSize: '0.82em', fontWeight: 700, color: 'var(--sc-muted)' }}>
        <span style={{ color: 'var(--sc-text)' }}>{Math.round(c.earned)}</span>/{Math.round(c.weight)}
      </span>
    </div>
  );
}

function CompositionCard({ bd, labelOf, delay }: { bd: LevelBreakdown; labelOf: (k: string) => string; delay: number }) {
  return (
    <section className="sc-rise" style={{ ...card, gap: '0.3em', animationDelay: `${delay}ms` }}>
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

export default function BusinessAccessibility() {
  const { me, reload } = useBusiness();
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(me.points[0]?.id ?? null);
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

  const point = me.points.find((p) => p.id === selId) ?? me.points[0] ?? null;
  const bd = point && catalog.length ? accessLevelBreakdown(point.features, catalog, point.category) : null;
  const labelOf = (key: string) => catalog.find((f) => f.key === key)?.label ?? key;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.3em' }}>
      <style>{`
        @keyframes scRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @keyframes scArc { from { stroke-dashoffset: 260; } to { stroke-dashoffset: 0; } }
        @keyframes scGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .sc-rise { animation: scRise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .sc-gauge-arc { animation: scArc 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .sc-bar-fill { transform-origin: left center; animation: scGrow 0.7s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .sc-a11y-row2 { display: grid; grid-template-columns: 1.15fr 2fr; gap: 1em; align-items: stretch; }
        @media (max-width: 880px) { .sc-a11y-row2 { grid-template-columns: 1fr; } }
        @media (prefers-reduced-motion: reduce) {
          .sc-rise, .sc-gauge-arc, .sc-bar-fill { animation: none !important; }
        }
      `}</style>

      <div>
        <h1 style={{ margin: 0, fontSize: '1.6em', fontWeight: 800 }}>Доступність і верифікація</h1>
        <p style={{ margin: '0.3em 0 0', color: 'var(--sc-muted)', fontSize: '0.92em' }}>
          Ваша оцінка доступності, що покращити найперше, і як підтвердити дані модератором.
        </p>
      </div>

      {!point ? (
        <section style={card}><p style={{ margin: 0, color: 'var(--sc-muted)' }}>У вас ще немає точок.</p></section>
      ) : (
        <>
          {/* Header strip: point selector (left) + wide verification bar (right) */}
          <div style={{ display: 'flex', gap: '1em', alignItems: 'stretch', flexWrap: 'wrap' }}>
            <PointSelect points={me.points} value={point.id} onChange={setSelId} />
            <div key={`vb-${point.id}`} style={{ flex: '1 1 340px', minWidth: 0 }}>
              <VerificationBar state={verifyState(point)} busy={busyId === point.id} onRequest={() => askVerify(point.id)} />
            </div>
          </div>

          {!bd ? (
            <section style={card}><p style={{ margin: 0, color: 'var(--sc-muted)' }}>Немає критеріїв доступності для цієї категорії.</p></section>
          ) : (
            /* keyed by point id so cards re-animate when the selection changes */
            <div key={`cards-${point.id}`} style={{ display: 'flex', flexDirection: 'column', gap: '1em' }}>
              <div className="sc-a11y-row2">
                <ScoreCard bd={bd} delay={60} />
                <ImprovementCard bd={bd} labelOf={labelOf} editHref={`/point/${point.id}/edit`} delay={120} />
              </div>
              <CompositionCard bd={bd} labelOf={labelOf} delay={180} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
