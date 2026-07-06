'use client';

import { useEffect, useMemo, useState } from 'react';
import { LoadingState, ErrorState, Button } from '@/components/ui';
import { AdminPanel, SearchBar, FilterChips, AdminRow, Empty, btnCol, smallBtn } from '@/components/AdminUI';
import { toast } from '@/lib/toast';
import { recentReviews, deleteReview, type AdminReview } from '@/lib/admin';

const STAR_OPTIONS = [
  { value: 'all', label: 'Усі' },
  { value: '5', label: '5★' },
  { value: '4', label: '4★' },
  { value: '3', label: '3★' },
  { value: '2', label: '2★' },
  { value: '1', label: '1★' },
];

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState('');
  const [stars, setStars] = useState('all');

  useEffect(() => {
    recentReviews(100).then(setReviews).catch(() => setErr(true));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (reviews ?? []).filter((r) => {
      if (stars !== 'all' && r.stars !== Number(stars)) return false;
      if (!needle) return true;
      return (r.text ?? '').toLowerCase().includes(needle) || (r.pointName ?? '').toLowerCase().includes(needle);
    });
  }, [reviews, q, stars]);

  async function onDelete(id: string) {
    try {
      await deleteReview(id);
      setReviews((r) => (r ?? []).filter((x) => x.id !== id));
      toast('Відгук видалено.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося видалити', 'error');
    }
  }

  if (err) return <ErrorState onRetry={() => location.reload()} />;
  if (!reviews) return <LoadingState label="Завантаження відгуків" />;

  return (
    <AdminPanel
      title="Останні відгуки"
      count={filtered.length}
      description="Нові відгуки на місцях. Видаляйте спам або образливий вміст."
      toolbar={
        <>
          <SearchBar value={q} onChange={setQ} placeholder="Пошук за текстом чи місцем" />
          <FilterChips options={STAR_OPTIONS} value={stars} onChange={setStars} label="Оцінка" />
        </>
      }
    >
      {filtered.length === 0 ? (
        <Empty>{reviews.length === 0 ? 'Немає відгуків.' : 'Немає збігів за фільтром.'}</Empty>
      ) : (
        filtered.map((r) => (
          <AdminRow key={r.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9em' }}>
                <span aria-label={`${r.stars} з 5`} style={{ color: 'var(--sc-warn)' }}>{'★'.repeat(r.stars)}</span>
                <span aria-hidden style={{ color: 'var(--sc-border-strong)' }}>{'★'.repeat(5 - r.stars)}</span>
              </div>
              {r.pointName ? <div style={{ color: 'var(--sc-muted)', fontSize: '0.8em' }}>{r.pointName}</div> : null}
              {r.text ? <div style={{ fontSize: '0.85em', marginTop: '0.2em' }}>{r.text.length > 160 ? r.text.slice(0, 160) + '…' : r.text}</div> : null}
            </div>
            <div style={btnCol}>
              <Button variant="danger" onClick={() => onDelete(r.id)} style={smallBtn}>Видалити</Button>
            </div>
          </AdminRow>
        ))
      )}
    </AdminPanel>
  );
}
