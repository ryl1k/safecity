import type { ProblemStatus } from '@safecity/shared';

const meta: Record<ProblemStatus, { label: string; key: string }> = {
  reported: { label: 'Повідомлено', key: 'unk' },
  confirmed: { label: 'Підтверджено', key: 'warn' },
  escalated: { label: 'Передано місту', key: 'bad' },
  resolved: { label: 'Вирішено', key: 'ok' },
};

export function StatusPill({ status }: { status: ProblemStatus }) {
  const m = meta[status];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.35em',
        background: `var(--sc-${m.key}-bg)`, color: `var(--sc-${m.key})`,
        border: `var(--sc-bw) solid var(--sc-${m.key}-line)`, borderRadius: '2em',
        padding: '0.25em 0.7em', fontWeight: 800, fontSize: '0.78em',
      }}
    >
      {m.label}
    </span>
  );
}
