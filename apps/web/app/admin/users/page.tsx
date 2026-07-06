'use client';

import { useEffect, useMemo, useState } from 'react';
import { LoadingState, ErrorState } from '@/components/ui';
import { AdminPanel, SearchBar, FilterChips, AdminRow, Empty } from '@/components/AdminUI';
import { useAdmin } from '@/lib/adminContext';
import { listUsers, setUserRole, type AdminUser, type UserRole } from '@/lib/admin';

const ROLES: UserRole[] = ['user', 'trusted', 'moderator'];
const roleLabel: Record<UserRole, string> = { user: 'Користувач', trusted: 'Довірений', moderator: 'Модератор' };

export default function UsersPage() {
  const { meId } = useAdmin();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');

  useEffect(() => {
    listUsers(200).then(setUsers).catch(() => setErr(true));
  }, []);

  const roleOptions = useMemo(
    () => [{ value: 'all', label: 'Усі' }, ...ROLES.map((r) => ({ value: r, label: roleLabel[r] }))],
    [],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (role !== 'all' && u.role !== role) return false;
      if (!needle) return true;
      return (u.displayName ?? '').toLowerCase().includes(needle);
    });
  }, [users, q, role]);

  async function onRole(id: string, next: UserRole) {
    await setUserRole(id, next);
    setUsers((u) => (u ?? []).map((x) => (x.id === id ? { ...x, role: next } : x)));
  }

  if (err) return <ErrorState onRetry={() => location.reload()} />;
  if (!users) return <LoadingState label="Завантаження користувачів" />;

  return (
    <AdminPanel
      title="Користувачі"
      count={filtered.length}
      description="Керування ролями. Довірені користувачі проходять модерацію швидше; модератори мають доступ до цієї консолі."
      toolbar={
        <>
          <SearchBar value={q} onChange={setQ} placeholder="Пошук за іменем" />
          <FilterChips options={roleOptions} value={role} onChange={setRole} label="Роль" />
        </>
      }
    >
      {filtered.length === 0 ? (
        <Empty>{users.length === 0 ? 'Немає користувачів.' : 'Немає збігів за фільтром.'}</Empty>
      ) : (
        filtered.map((u) => (
          <AdminRow key={u.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>
                {u.displayName ?? 'Без імені'}{u.id === meId ? ' (ви)' : ''}
              </div>
              <div style={{ color: 'var(--sc-muted)', fontSize: '0.78em' }}>{roleLabel[u.role]}</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4em', fontSize: '0.82em' }}>
              <span className="sr-only">Роль</span>
              <select
                className="sc-foc"
                value={u.role}
                onChange={(e) => onRole(u.id, e.target.value as UserRole)}
                style={{ padding: '0.4em 0.5em', borderRadius: '0.5em', border: 'var(--sc-bw) solid var(--sc-border-strong)', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'inherit' }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{roleLabel[r]}</option>
                ))}
              </select>
            </label>
          </AdminRow>
        ))
      )}
    </AdminPanel>
  );
}
