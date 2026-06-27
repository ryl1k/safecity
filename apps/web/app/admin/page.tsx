'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { StatusPill } from '@/components/StatusPill';
import { Button, LoadingState, ErrorState } from '@/components/ui';
import { categoryLabel } from '@/lib/format';
import {
  getMyRole,
  unverifiedPoints,
  setPointVerify,
  deletePoint,
  openProblems,
  resolveProblem,
  deleteProblem,
  recentReviews,
  deleteReview,
  listUsers,
  setUserRole,
  type AdminPoint,
  type AdminProblem,
  type AdminReview,
  type AdminUser,
  type UserRole,
} from '@/lib/admin';

type Gate = 'loading' | 'guest' | 'denied' | 'ok' | 'error';

const ROLES: UserRole[] = ['user', 'trusted', 'moderator'];
const roleLabel: Record<UserRole, string> = { user: 'Користувач', trusted: 'Довірений', moderator: 'Модератор' };
const profileLabel: Record<string, string> = { wheelchair: 'крісло колісне', blind: 'незрячі' };

export default function AdminPage() {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>('loading');
  const [me, setMe] = useState<string | null>(null);
  const [points, setPoints] = useState<AdminPoint[]>([]);
  const [problems, setProblems] = useState<AdminProblem[]>([]);
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);

  const loadData = useCallback(async () => {
    const [pts, prs, rvs, usrs] = await Promise.all([
      unverifiedPoints(),
      openProblems(),
      recentReviews(),
      listUsers(),
    ]);
    setPoints(pts);
    setProblems(prs);
    setReviews(rvs);
    setUsers(usrs);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const who = await getMyRole();
        if (!who) {
          setGate('guest');
          return;
        }
        if (who.role !== 'moderator') {
          setGate('denied');
          return;
        }
        setMe(who.userId);
        await loadData();
        setGate('ok');
      } catch {
        setGate('error');
      }
    })();
  }, [loadData]);

  async function onVerify(id: string, status: 'verified' | 'official') {
    await setPointVerify(id, status);
    setPoints((p) => p.filter((x) => x.id !== id));
  }
  async function onDeletePoint(id: string) {
    await deletePoint(id);
    setPoints((p) => p.filter((x) => x.id !== id));
  }
  async function onResolve(id: string) {
    await resolveProblem(id);
    setProblems((p) => p.filter((x) => x.id !== id));
  }
  async function onDeleteProblem(id: string) {
    await deleteProblem(id);
    setProblems((p) => p.filter((x) => x.id !== id));
  }
  async function onDeleteReview(id: string) {
    await deleteReview(id);
    setReviews((r) => r.filter((x) => x.id !== id));
  }
  async function onRole(id: string, role: UserRole) {
    await setUserRole(id, role);
    setUsers((u) => u.map((x) => (x.id === id ? { ...x, role } : x)));
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader />
      <main id="main-content" tabIndex={-1} style={{ maxWidth: 1100, margin: '0 auto', padding: '1.6em 1.25em 4em', width: '100%' }}>
        <h1 style={{ margin: '0 0 1em', fontSize: '1.7em', fontWeight: 800 }}>Консоль модерації</h1>

        {gate === 'loading' && <LoadingState label="Перевірка доступу" />}
        {gate === 'error' && <ErrorState onRetry={() => router.refresh()} />}

        {gate === 'guest' && (
          <Card>
            <p style={{ margin: '0 0 1em' }}>Увійдіть як модератор, щоб відкрити консоль.</p>
            <Link href="/auth?next=/admin" style={{ textDecoration: 'none' }}><Button>Увійти</Button></Link>
          </Card>
        )}

        {gate === 'denied' && (
          <Card>
            <p style={{ margin: 0, fontWeight: 700 }}>Доступ лише для модераторів.</p>
            <p style={{ margin: '0.5em 0 0', color: 'var(--sc-muted)', fontSize: '0.9em' }}>
              Призначити роль можна командою <code>pnpm db:make-admin &lt;ваша-пошта&gt;</code>.
            </p>
          </Card>
        )}

        {gate === 'ok' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.2em', alignItems: 'start' }}>
            <Section title={`Непідтверджені місця (${points.length})`}>
              {points.length === 0 ? (
                <Empty>Усе перевірено.</Empty>
              ) : (
                points.map((p) => (
                  <Row key={p.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div style={{ color: 'var(--sc-muted)', fontSize: '0.82em' }}>
                        {categoryLabel[p.category]}{p.address ? ` · ${p.address}` : ''}
                      </div>
                    </div>
                    <div style={btnCol}>
                      <Button onClick={() => onVerify(p.id, 'verified')} style={smallBtn}>Підтвердити</Button>
                      <Button variant="secondary" onClick={() => onVerify(p.id, 'official')} style={smallBtn}>Офіційне</Button>
                      <Button variant="danger" onClick={() => onDeletePoint(p.id)} style={smallBtn}>Видалити</Button>
                    </div>
                  </Row>
                ))
              )}
            </Section>

            <Section title={`Відкриті проблеми (${problems.length})`}>
              {problems.length === 0 ? (
                <Empty>Немає відкритих проблем.</Empty>
              ) : (
                problems.map((p) => (
                  <Row key={p.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '0.5em', alignItems: 'center', flexWrap: 'wrap' }}>
                        <StatusPill status={p.status} />
                        <span style={{ fontSize: '0.78em', color: 'var(--sc-muted)', fontWeight: 700 }}>{p.confirmations} підтв.</span>
                      </div>
                      <div style={{ fontWeight: 700, marginTop: '0.3em' }}>{p.title}</div>
                    </div>
                    <div style={btnCol}>
                      <Button variant="secondary" onClick={() => onResolve(p.id)} style={smallBtn}>Вирішено</Button>
                      <Button variant="danger" onClick={() => onDeleteProblem(p.id)} style={smallBtn}>Спам</Button>
                    </div>
                  </Row>
                ))
              )}
            </Section>

            <Section title={`Останні відгуки (${reviews.length})`}>
              {reviews.length === 0 ? (
                <Empty>Немає відгуків.</Empty>
              ) : (
                reviews.map((r) => (
                  <Row key={r.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9em' }}>
                        <span aria-hidden style={{ color: 'var(--sc-warn)' }}>{'★'.repeat(r.stars)}</span>
                        <span style={{ color: 'var(--sc-muted)', fontWeight: 600 }}> · {profileLabel[r.profile] ?? r.profile}</span>
                      </div>
                      {r.pointName ? <div style={{ color: 'var(--sc-muted)', fontSize: '0.8em' }}>{r.pointName}</div> : null}
                      {r.text ? <div style={{ fontSize: '0.85em', marginTop: '0.2em' }}>{r.text.length > 120 ? r.text.slice(0, 120) + '…' : r.text}</div> : null}
                    </div>
                    <Button variant="danger" onClick={() => onDeleteReview(r.id)} style={smallBtn}>Видалити</Button>
                  </Row>
                ))
              )}
            </Section>

            <Section title={`Користувачі (${users.length})`}>
              {users.length === 0 ? (
                <Empty>Немає користувачів.</Empty>
              ) : (
                users.map((u) => (
                  <Row key={u.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>
                        {u.displayName ?? 'Без імені'}{u.id === me ? ' (ви)' : ''}
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
                        {ROLES.map((role) => (
                          <option key={role} value={role}>{roleLabel[role]}</option>
                        ))}
                      </select>
                    </label>
                  </Row>
                ))
              )}
            </Section>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '1.4em', maxWidth: 460 }}>{children}</div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '1.2em' }}>
      <h2 style={{ margin: '0 0 0.8em', fontSize: '1.05em', fontWeight: 800 }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6em' }}>{children}</div>
    </section>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em', padding: '0.6em', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '0.7em' }}>{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, color: 'var(--sc-muted)', fontSize: '0.9em' }}>{children}</p>;
}

const btnCol = { display: 'flex', flexDirection: 'column', gap: '0.35em', flexShrink: 0 } as const;
const smallBtn = { minHeight: '2.2em', fontSize: '0.82em', padding: '0 0.7em' } as const;
