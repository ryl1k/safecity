'use client';

import { useEffect, useMemo, useState } from 'react';
import { LoadingState, ErrorState, Button } from '@/components/ui';
import { AdminPanel, SearchBar, FilterChips, AdminRow, Empty, btnCol, smallBtn } from '@/components/AdminUI';
import { toast } from '@/lib/toast';
import { listUserSegments, deleteSegment, type AdminSegment } from '@/lib/admin';

const RATING_LABELS: Record<string, string> = {
  full: 'Повністю доступний',
  partial: 'Частково доступний',
  none: 'Недоступний',
  unknown: 'Невідомо',
};

const SURFACE_LABELS: Record<string, string> = {
  asphalt: 'Асфальт',
  paving_stones: 'Тротуарна плитка',
  cobblestone: 'Бруківка',
  sett: 'Бруківка (тесана)',
  concrete: 'Бетон',
  gravel: 'Гравій',
  dirt: 'Ґрунт',
  grass: 'Трава',
};

export default function AdminSegmentsPage() {
  const [segments, setSegments] = useState<AdminSegment[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState('');
  const [rating, setRating] = useState('all');

  useEffect(() => {
    listUserSegments().then(setSegments).catch(() => setErr(true));
  }, []);

  const ratingOptions = [
    { value: 'all', label: 'Усі' },
    { value: 'full', label: 'Повні' },
    { value: 'partial', label: 'Часткові' },
    { value: 'none', label: 'Недоступні' },
    { value: 'unknown', label: 'Невідомо' },
  ];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (segments ?? []).filter((s) => {
      if (rating !== 'all' && s.rating !== rating) return false;
      if (!needle) return true;
      return (s.street_name ?? '').toLowerCase().includes(needle);
    });
  }, [segments, q, rating]);

  async function onDelete(id: string) {
    try {
      await deleteSegment(id);
      setSegments((s) => (s ?? []).filter((x) => x.id !== id));
      toast('Сегмент видалено.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вдалося видалити', 'error');
    }
  }

  if (err) return <ErrorState onRetry={() => location.reload()} />;
  if (!segments) return <LoadingState label="Завантаження сегментів" />;

  return (
    <AdminPanel
      title="Сегменти користувачів"
      count={filtered.length}
      description="Ділянки тротуарів, додані користувачами (без OSM-імпорту). Видаляйте некоректні або дублікати."
      toolbar={
        <>
          <SearchBar value={q} onChange={setQ} placeholder="Пошук за назвою вулиці" />
          <FilterChips options={ratingOptions} value={rating} onChange={setRating} label="Рейтинг" />
        </>
      }
    >
      {filtered.length === 0 ? (
        <Empty>{segments.length === 0 ? 'Немає сегментів від користувачів.' : 'Немає збігів за фільтром.'}</Empty>
      ) : (
        filtered.map((s) => (
          <AdminRow key={s.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{s.street_name ?? '—'}</div>
              <div style={{ color: 'var(--sc-muted)', fontSize: '0.82em' }}>
                {RATING_LABELS[s.rating] ?? s.rating}
                {s.surface_type ? ` · ${SURFACE_LABELS[s.surface_type] ?? s.surface_type}` : ''}
                {' · '}
                {new Date(s.created_at).toLocaleDateString('uk-UA')}
              </div>
            </div>
            <div style={btnCol}>
              <Button variant="danger" onClick={() => onDelete(s.id)} style={smallBtn}>Видалити</Button>
            </div>
          </AdminRow>
        ))
      )}
    </AdminPanel>
  );
}
