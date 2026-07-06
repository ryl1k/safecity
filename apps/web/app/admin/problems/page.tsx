'use client';

import { useEffect, useMemo, useState } from 'react';
import { LoadingState, ErrorState, Button } from '@/components/ui';
import { StatusPill } from '@/components/StatusPill';
import { AdminPanel, SearchBar, FilterChips, AdminRow, Empty, btnCol, smallBtn } from '@/components/AdminUI';
import { toast } from '@/lib/toast';
import { openProblems, resolveProblem, deleteProblem, type AdminProblem } from '@/lib/admin';

const statusLabel: Record<string, string> = {
  reported: 'Повідомлено',
  confirmed: 'Підтверджено',
  escalated: 'Ескальовано',
  resolved: 'Вирішено',
};

export default function ProblemsPage() {
  const [problems, setProblems] = useState<AdminProblem[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    openProblems().then(setProblems).catch(() => setErr(true));
  }, []);

  const statusOptions = useMemo(() => {
    const present = Array.from(new Set((problems ?? []).map((p) => p.status)));
    return [{ value: 'all', label: 'Усі' }, ...present.map((s) => ({ value: s, label: statusLabel[s] ?? s }))];
  }, [problems]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (problems ?? [])
      .filter((p) => (status === 'all' || p.status === status) && (!needle || p.title.toLowerCase().includes(needle)))
      .sort((a, b) => b.confirmations - a.confirmations);
  }, [problems, q, status]);

  async function onResolve(id: string) {
    try {
      await resolveProblem(id);
      setProblems((p) => (p ?? []).filter((x) => x.id !== id));
      toast('Проблему позначено вирішеною.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося оновити проблему', 'error');
    }
  }
  async function onDelete(id: string) {
    try {
      await deleteProblem(id);
      setProblems((p) => (p ?? []).filter((x) => x.id !== id));
      toast('Проблему видалено.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося видалити', 'error');
    }
  }

  if (err) return <ErrorState onRetry={() => location.reload()} />;
  if (!problems) return <LoadingState label="Завантаження проблем" />;

  return (
    <AdminPanel
      title="Відкриті проблеми"
      count={filtered.length}
      description="Звернення про проблеми доступності. Позначте вирішеними або видаліть спам."
      toolbar={
        <>
          <SearchBar value={q} onChange={setQ} placeholder="Пошук за назвою" />
          {statusOptions.length > 2 && <FilterChips options={statusOptions} value={status} onChange={setStatus} label="Статус" />}
        </>
      }
    >
      {filtered.length === 0 ? (
        <Empty>{problems.length === 0 ? 'Немає відкритих проблем.' : 'Немає збігів за фільтром.'}</Empty>
      ) : (
        filtered.map((p) => (
          <AdminRow key={p.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: '0.5em', alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusPill status={p.status} />
                <span style={{ fontSize: '0.78em', color: 'var(--sc-muted)', fontWeight: 700 }}>{p.confirmations} підтв.</span>
              </div>
              <div style={{ fontWeight: 700, marginTop: '0.3em' }}>{p.title}</div>
            </div>
            <div style={btnCol}>
              <Button variant="secondary" onClick={() => onResolve(p.id)} style={smallBtn}>Вирішено</Button>
              <Button variant="danger" onClick={() => onDelete(p.id)} style={smallBtn}>Спам</Button>
            </div>
          </AdminRow>
        ))
      )}
    </AdminPanel>
  );
}
