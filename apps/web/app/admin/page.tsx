'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { StatusPill } from '@/components/StatusPill';
import { Button, LoadingState, ErrorState } from '@/components/ui';
import { categoryLabel } from '@/lib/format';
import {
  getMyRole,
  unverifiedPoints,
  verifyPoint,
  openProblems,
  resolveProblem,
  type AdminPoint,
  type AdminProblem,
} from '@/lib/admin';

type Gate = 'loading' | 'guest' | 'denied' | 'ok' | 'error';

export default function AdminPage() {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>('loading');
  const [points, setPoints] = useState<AdminPoint[]>([]);
  const [problems, setProblems] = useState<AdminProblem[]>([]);

  const loadData = useCallback(async () => {
    const [pts, prs] = await Promise.all([unverifiedPoints(), openProblems()]);
    setPoints(pts);
    setProblems(prs);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMyRole();
        if (!me) {
          setGate('guest');
          return;
        }
        if (me.role !== 'moderator') {
          setGate('denied');
          return;
        }
        await loadData();
        setGate('ok');
      } catch {
        setGate('error');
      }
    })();
  }, [loadData]);

  async function onVerify(id: string) {
    await verifyPoint(id);
    setPoints((p) => p.filter((x) => x.id !== id));
  }
  async function onResolve(id: string) {
    await resolveProblem(id);
    setProblems((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <AppHeader />
      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '1.6em 1.25em 4em' }}>
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
                    <Button onClick={() => onVerify(p.id)} style={{ minHeight: '2.4em' }}>Підтвердити</Button>
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
                    <Button variant="secondary" onClick={() => onResolve(p.id)} style={{ minHeight: '2.4em' }}>Вирішено</Button>
                  </Row>
                ))
              )}
            </Section>
          </div>
        )}
      </main>
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
