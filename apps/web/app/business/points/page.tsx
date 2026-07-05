'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye } from 'lucide-react';
import type { AccessibilityFeature } from '@safecity/shared';
import { accessLevel } from '@safecity/shared';
import { Button } from '@/components/ui';
import { categoryLabel } from '@/lib/format';
import { levelLabel, levelColor } from '@/lib/filters';
import { getCatalog } from '@/lib/catalog';
import { toast } from '@/lib/toast';
import { deletePoint } from '@/lib/points';
import { useBusiness } from '@/lib/businessContext';

const verifyLabel: Record<string, { label: string; ok: boolean }> = {
  unverified: { label: 'Не перевірено', ok: false },
  verified: { label: 'Перевірено', ok: true },
  official: { label: 'Офіційно', ok: true },
};

export default function BusinessPoints() {
  const { me, reload } = useBusiness();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);
  useEffect(() => { void getCatalog().then(setCatalog).catch(() => {}); }, []);

  async function onDelete(id: string) {
    if (!confirm('Видалити цю точку? Дію не можна скасувати.')) return;
    setBusyId(id);
    try {
      await deletePoint(id);
      await reload();
      toast('Точку видалено.', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Не вдалося видалити', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1em' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6em' }}>
        <h1 style={{ margin: 0, fontSize: '1.6em', fontWeight: 800 }}>Мої точки</h1>
        <Link href="/contribute" style={{ textDecoration: 'none' }}>
          <Button variant="secondary" style={{ minHeight: '2.3em', fontSize: '0.85em' }}>+ Додати точку</Button>
        </Link>
      </div>

      <section style={{ background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', overflow: 'hidden' }}>
        {me.points.length === 0 ? (
          <p style={{ margin: 0, padding: '1.2em 1.3em', color: 'var(--sc-muted)' }}>Ви ще не додали жодної точки.</p>
        ) : (
          me.points.map((p, i) => {
            const v = verifyLabel[p.verifyStatus] ?? { label: p.verifyStatus, ok: false };
            const lvl = catalog.length ? accessLevel(p.features, catalog, p.category) : null;
            return (
              <div
                key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.8em', flexWrap: 'wrap',
                  padding: '0.9em 1.3em', borderTop: i === 0 ? 'none' : 'var(--sc-bw) solid var(--sc-border)',
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
                  {lvl && (
                    <span title="Рівень доступності" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em', fontWeight: 700, color: levelColor[lvl] }}>
                      <span aria-hidden style={{ width: '0.55em', height: '0.55em', borderRadius: '50%', background: levelColor[lvl] }} />
                      {levelLabel[lvl]}
                    </span>
                  )}
                  <span title="Перегляди" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3em', color: 'var(--sc-muted)', fontWeight: 700 }}><Eye size={15} aria-hidden /> {p.viewCount}</span>
                  <span style={{ color: v.ok ? 'var(--sc-ok)' : 'var(--sc-muted)', fontWeight: 700 }}>{v.label}</span>
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
  );
}
