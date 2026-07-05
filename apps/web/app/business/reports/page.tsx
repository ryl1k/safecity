'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, ThumbsUp } from 'lucide-react';
import { DashboardHeader } from '@/components/DashboardHeader';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { levelColor } from '@/lib/filters';
import { businessReports, type BusinessReport } from '@/lib/business';

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.1em 1.2em',
} as const;

// Severity 1..3 → label + color (worse = redder).
const severityMeta: Record<number, { label: string; color: string }> = {
  1: { label: 'Незначна', color: 'var(--sc-muted)' },
  2: { label: 'Середня', color: levelColor.medium },
  3: { label: 'Серйозна', color: 'var(--sc-bad)' },
};

// problem_status → label + color; `open` groups everything not yet resolved.
const statusMeta: Record<string, { label: string; color: string; open: boolean }> = {
  reported: { label: 'Нове', color: 'var(--sc-primary)', open: true },
  confirmed: { label: 'Підтверджено', color: levelColor.medium, open: true },
  escalated: { label: 'Ескальовано', color: 'var(--sc-bad)', open: true },
  resolved: { label: 'Вирішено', color: 'var(--sc-ok)', open: false },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Badge({ label, color, filled }: { label: string; color: string; filled?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35em', padding: '0.25em 0.7em', borderRadius: '2em',
      fontSize: '0.76em', fontWeight: 800, whiteSpace: 'nowrap',
      color: filled ? '#fff' : color, background: filled ? color : 'transparent',
      border: `var(--sc-bw) solid ${color}`,
    }}>
      {label}
    </span>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ ...card, padding: '0.8em 1em', flex: '1 1 130px', minWidth: 0 }}>
      <div style={{ fontSize: '0.74em', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--sc-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.6em', fontWeight: 800, marginTop: '0.1em', color: color ?? 'var(--sc-text)' }}>{value}</div>
    </div>
  );
}

function ReportCard({ r }: { r: BusinessReport }) {
  const sev = severityMeta[r.severity] ?? severityMeta[1]!;
  const st = statusMeta[r.status] ?? { label: r.status, color: 'var(--sc-muted)', open: true };
  return (
    <li>
      <Link href={`/problem/${r.id}`} className="sc-foc" style={{ ...card, display: 'block', textDecoration: 'none', color: 'var(--sc-text)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap', marginBottom: '0.5em' }}>
          <Badge label={`Серйозність: ${sev.label}`} color={sev.color} filled={r.severity === 3} />
          <Badge label={st.label} color={st.color} filled={!st.open} />
          <span style={{ marginLeft: 'auto', color: 'var(--sc-muted)', fontSize: '0.8em' }}>{fmtDate(r.createdAt)}</span>
        </div>
        <div style={{ fontWeight: 800, fontSize: '1.02em' }}>{r.title}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em', color: 'var(--sc-muted)', fontSize: '0.84em', marginTop: '0.2em' }}>
          <MapPin size={14} aria-hidden /> {r.pointName}
        </div>
        {r.description && (
          <p style={{ margin: '0.55em 0 0', color: 'var(--sc-text)', fontSize: '0.9em', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {r.description}
          </p>
        )}
        {r.photos.length > 0 && (
          <div style={{ display: 'flex', gap: '0.4em', marginTop: '0.6em', flexWrap: 'wrap' }}>
            {r.photos.slice(0, 4).map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: '0.5em', border: 'var(--sc-bw) solid var(--sc-border)' }} />
            ))}
          </div>
        )}
        {r.confirmations > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em', marginTop: '0.6em', color: 'var(--sc-muted)', fontSize: '0.8em', fontWeight: 700 }}>
            <ThumbsUp size={13} aria-hidden /> {r.confirmations} підтвердж.
          </div>
        )}
      </Link>
    </li>
  );
}

export default function BusinessReports() {
  const [reports, setReports] = useState<BusinessReport[] | null>(null);
  const [error, setError] = useState(false);

  function load() {
    setError(false);
    setReports(null);
    businessReports().then(setReports).catch(() => setError(true));
  }
  useEffect(() => { load(); }, []);

  const open = reports?.filter((r) => statusMeta[r.status]?.open ?? true).length ?? 0;
  const resolved = (reports?.length ?? 0) - open;

  return (
    <div className="sc-stagger" style={{ display: 'flex', flexDirection: 'column', gap: '1.2em' }}>
      <DashboardHeader
        title="Звернення"
        subtitle="Проблеми, які відвідувачі повідомили про ваші точки."
        hideSelector
      />

      {error ? (
        <ErrorState onRetry={load} />
      ) : reports === null ? (
        <LoadingState label="Завантаження звернень" />
      ) : reports.length === 0 ? (
        <EmptyState title="Поки що немає звернень" message="Коли відвідувачі повідомлять про проблему на ваших точках, вона з’явиться тут." />
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.8em', flexWrap: 'wrap' }}>
            <StatChip label="Всього" value={reports.length} />
            <StatChip label="Відкриті" value={open} color={open > 0 ? 'var(--sc-bad)' : undefined} />
            <StatChip label="Вирішені" value={resolved} color={resolved > 0 ? 'var(--sc-ok)' : undefined} />
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.8em' }}>
            {reports.map((r) => <ReportCard key={r.id} r={r} />)}
          </ul>
        </>
      )}
    </div>
  );
}
