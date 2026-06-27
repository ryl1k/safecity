'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { StatusPill } from '@/components/StatusPill';
import { Button, LoadingState, ErrorState } from '@/components/ui';
import { problemById, type ProblemRow, type PetitionRow } from '@/lib/civic';
import { supabase } from '@/lib/supabase';

const PETITION_GOAL = 250;

function isDuplicate(message?: string): boolean {
  return Boolean(message && /(duplicate|already exists|23505)/i.test(message));
}

export default function ProblemPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'notfound'>('loading');
  const [problem, setProblem] = useState<ProblemRow | null>(null);
  const [petition, setPetition] = useState<PetitionRow | null>(null);
  const [confirms, setConfirms] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [signed, setSigned] = useState(false);

  async function load() {
    setStatus('loading');
    try {
      const res = await problemById(params.id);
      if (!res) {
        setStatus('notfound');
        return;
      }
      setProblem(res.problem);
      setPetition(res.petition);
      setConfirms(res.problem.confirmations);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function requireUser(): Promise<string | null> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      router.push(`/auth?next=/problem/${params.id}`);
      return null;
    }
    return data.user.id;
  }

  async function confirm() {
    const uid = await requireUser();
    if (!uid) return;
    const { error } = await supabase.from('problem_confirmations').insert({ problem_id: params.id, user_id: uid });
    // No error = a new confirmation. Duplicate = the user already confirmed (treat as success, no extra count).
    if (!error) setConfirms((c) => c + 1);
    else if (!isDuplicate(error.message)) return; // genuine error — leave state unchanged
    setConfirmed(true);
  }

  async function sign() {
    if (!petition) return;
    const uid = await requireUser();
    if (!uid) return;
    const { error } = await supabase.from('petition_signatures').insert({ petition_id: petition.id, user_id: uid });
    if (error && !isDuplicate(error.message)) return;
    setSigned(true);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="civic" />
      <main style={{ flex: 1, maxWidth: 700, width: '100%', margin: '0 auto', padding: '1.4em 1.25em 4em' }}>
        <Link href="/civic" className="sc-foc" style={{ color: 'var(--sc-primary)', fontWeight: 700, textDecoration: 'none', fontSize: '0.9em' }}>
          ‹ До громади
        </Link>

        {status === 'loading' && <div style={{ marginTop: '1em' }}><LoadingState label="Завантаження проблеми" /></div>}
        {status === 'error' && <div style={{ marginTop: '1em' }}><ErrorState onRetry={() => void load()} /></div>}
        {status === 'notfound' && <p style={{ marginTop: '1.5em', color: 'var(--sc-muted)' }}>Проблему не знайдено.</p>}

        {status === 'ready' && problem && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', marginTop: '1em' }}>
              <StatusPill status={problem.status} />
              {problem.pointName ? <span style={{ color: 'var(--sc-muted)', fontSize: '0.85em' }}>{problem.pointName}</span> : null}
            </div>
            <h1 style={{ margin: '0.4em 0 0.3em', fontSize: '1.7em', fontWeight: 800, lineHeight: 1.2 }}>{problem.title}</h1>
            {problem.description ? <p style={{ margin: 0, color: 'var(--sc-text)', lineHeight: 1.55 }}>{problem.description}</p> : null}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em', marginTop: '1.2em', flexWrap: 'wrap' }}>
              <Button onClick={confirm} disabled={confirmed} variant={confirmed ? 'secondary' : 'primary'}>
                {confirmed ? '✓ Ви підтвердили' : 'Я теж це бачу'}
              </Button>
              <span style={{ color: 'var(--sc-muted)', fontWeight: 700 }} aria-live="polite">{confirms} підтверджень</span>
            </div>

            {petition && (
              <section style={{ marginTop: '1.6em', background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-primary)', borderRadius: '1em', padding: '1.3em' }}>
                <div style={{ fontSize: '0.78em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sc-primary)' }}>Петиція</div>
                <h2 style={{ margin: '0.3em 0 0.4em', fontSize: '1.2em', fontWeight: 800 }}>{petition.title}</h2>
                {petition.body ? <p style={{ margin: '0 0 1em', color: 'var(--sc-muted)', lineHeight: 1.5 }}>{petition.body}</p> : null}

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', fontWeight: 700, marginBottom: '0.35em' }}>
                  <span>{petition.internalSignatures + (signed ? 1 : 0)} підписів</span>
                  <span style={{ color: 'var(--sc-muted)' }}>ціль {PETITION_GOAL}</span>
                </div>
                <div role="progressbar" aria-valuenow={petition.internalSignatures} aria-valuemin={0} aria-valuemax={PETITION_GOAL} style={{ height: '0.7em', borderRadius: '1em', background: 'var(--sc-surface-2)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, ((petition.internalSignatures + (signed ? 1 : 0)) / PETITION_GOAL) * 100)}%`, height: '100%', background: 'var(--sc-primary)' }} />
                </div>

                <div style={{ display: 'flex', gap: '0.7em', marginTop: '1em', flexWrap: 'wrap' }}>
                  <Button onClick={sign} disabled={signed} variant={signed ? 'secondary' : 'primary'}>
                    {signed ? '✓ Ви підписали' : 'Підписати у застосунку'}
                  </Button>
                  {petition.officialUrl ? (
                    <a className="sc-foc" href={petition.officialUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      <Button variant="secondary">Офіційна петиція ↗</Button>
                    </a>
                  ) : null}
                </div>
                {petition.officialSignatureCount != null ? (
                  <p style={{ margin: '0.7em 0 0', fontSize: '0.8em', color: 'var(--sc-muted)' }}>
                    Офіційно зібрано: {petition.officialSignatureCount}
                  </p>
                ) : null}
              </section>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
