'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { StatusPill } from '@/components/StatusPill';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { listProblems, type ProblemRow } from '@/lib/civic';

export default function CivicPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [problems, setProblems] = useState<ProblemRow[]>([]);

  async function load() {
    setStatus('loading');
    try {
      setProblems(await listProblems());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="civic" />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '1.6em 1.25em 4em' }}>
        <h1 style={{ margin: '0 0 0.3em', fontSize: '1.8em', fontWeight: 800 }}>Громадські проблеми</h1>
        <p style={{ margin: '0 0 1.4em', color: 'var(--sc-muted)', lineHeight: 1.5 }}>
          Повідомляйте про бар’єри, підтверджуйте чужі повідомлення й передавайте їх місту через
          офіційні петиції. Разом ми робимо ваше місто доступним.
        </p>

        {status === 'loading' && <LoadingState label="Завантаження проблем" />}
        {status === 'error' && <ErrorState onRetry={() => void load()} />}
        {status === 'ready' && problems.length === 0 && (
          <EmptyState title="Поки немає проблем" message="Повідомте про перший бар’єр зі сторінки місця." />
        )}

        {status === 'ready' && problems.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.7em' }}>
            {problems.map((p) => (
              <li key={p.id}>
                <button
                  className="sc-foc"
                  onClick={() => router.push(`/problem/${p.id}`)}
                  aria-label={`${p.title}, ${p.confirmations} підтверджень`}
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                    background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
                    borderRadius: '1em', padding: '1em',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap' }}>
                    <StatusPill status={p.status} />
                    <span style={{ marginLeft: 'auto', fontSize: '0.8em', color: 'var(--sc-muted)', fontWeight: 700 }}>
                      {p.confirmations} підтверджень
                    </span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.05em', marginTop: '0.5em', color: 'var(--sc-text)' }}>{p.title}</div>
                  {p.pointName ? <div style={{ color: 'var(--sc-muted)', fontSize: '0.85em', marginTop: '0.2em' }}>{p.pointName}</div> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </div>
  );
}
