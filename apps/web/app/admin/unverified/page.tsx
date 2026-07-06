'use client';

import { useEffect, useMemo, useState } from 'react';
import { LoadingState, ErrorState, Button } from '@/components/ui';
import { AdminPanel, SearchBar, FilterChips, AdminRow, Empty, btnCol, smallBtn } from '@/components/AdminUI';
import { categoryLabel } from '@/lib/format';
import { unverifiedPoints, setPointVerify, deletePoint, type AdminPoint } from '@/lib/admin';

export default function UnverifiedPage() {
  const [points, setPoints] = useState<AdminPoint[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');

  useEffect(() => {
    unverifiedPoints().then(setPoints).catch(() => setErr(true));
  }, []);

  const catOptions = useMemo(() => {
    const present = Array.from(new Set((points ?? []).map((p) => p.category)));
    return [{ value: 'all', label: 'Усі' }, ...present.map((c) => ({ value: c, label: categoryLabel[c] ?? c }))];
  }, [points]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (points ?? []).filter((p) => {
      if (cat !== 'all' && p.category !== cat) return false;
      if (!needle) return true;
      return p.name.toLowerCase().includes(needle) || (p.address ?? '').toLowerCase().includes(needle);
    });
  }, [points, q, cat]);

  async function onVerify(id: string, status: 'verified' | 'official') {
    await setPointVerify(id, status);
    setPoints((p) => (p ?? []).filter((x) => x.id !== id));
  }
  async function onDelete(id: string) {
    await deletePoint(id);
    setPoints((p) => (p ?? []).filter((x) => x.id !== id));
  }

  if (err) return <ErrorState onRetry={() => location.reload()} />;
  if (!points) return <LoadingState label="Завантаження місць" />;

  return (
    <AdminPanel
      title="Непідтверджені місця"
      count={filtered.length}
      description="Місця, додані користувачами й бізнесом, що очікують перевірки модератором."
      toolbar={
        <>
          <SearchBar value={q} onChange={setQ} placeholder="Пошук за назвою чи адресою" />
          {catOptions.length > 2 && <FilterChips options={catOptions} value={cat} onChange={setCat} label="Категорія" />}
        </>
      }
    >
      {filtered.length === 0 ? (
        <Empty>{points.length === 0 ? 'Усе перевірено.' : 'Немає збігів за фільтром.'}</Empty>
      ) : (
        filtered.map((p) => (
          <AdminRow key={p.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{p.name}</div>
              <div style={{ color: 'var(--sc-muted)', fontSize: '0.82em' }}>
                {categoryLabel[p.category] ?? p.category}{p.address ? ` · ${p.address}` : ''}
              </div>
            </div>
            <div style={btnCol}>
              <Button onClick={() => onVerify(p.id, 'verified')} style={smallBtn}>Підтвердити</Button>
              <Button variant="secondary" onClick={() => onVerify(p.id, 'official')} style={smallBtn}>Офіційне</Button>
              <Button variant="danger" onClick={() => onDelete(p.id)} style={smallBtn}>Видалити</Button>
            </div>
          </AdminRow>
        ))
      )}
    </AdminPanel>
  );
}
