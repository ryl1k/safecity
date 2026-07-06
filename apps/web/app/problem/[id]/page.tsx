'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { StatusPill } from '@/components/StatusPill';
import { Button, LoadingState, ErrorState } from '@/components/ui';
import { PhotoGallery } from '@/components/PhotoGallery';
import { problemById, createPetition, type ProblemRow, type PetitionRow } from '@/lib/civic';
import { api, ApiError } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

const PETITION_GOAL = 250;
const ESCALATE_AT = 5; // confirmations needed before we suggest a petition

export default function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'notfound'>('loading');
  const [problem, setProblem] = useState<ProblemRow | null>(null);
  const [petition, setPetition] = useState<PetitionRow | null>(null);
  const [confirms, setConfirms] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [signed, setSigned] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    setStatus('loading');
    try {
      const res = await problemById(id);
      if (!res) {
        setStatus('notfound');
        return;
      }
      setProblem(res.problem);
      setPetition(res.petition);
      setConfirms(res.problem.confirmations);
      setStatus('ready');
      // Reflect whether the signed-in user already confirmed / signed (so we don't
      // re-POST and hit a 409, and the buttons show the right state).
      const { data: auth } = await supabase.auth.getSession();
      if (auth.session) {
        try {
          const me = await api.get<{ confirmed: boolean; signed: boolean }>(
            `/problems/${id}/me`,
            { auth: true },
          );
          setConfirmed(me.confirmed);
          if (res.petition) setSigned(me.signed);
        } catch {
          /* best-effort — buttons fall back to 409 handling */
        }
      }
    } catch {
      setStatus('error');
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function requireUser(): Promise<string | null> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      router.push(`/auth?next=/problem/${id}`);
      return null;
    }
    return data.user.id;
  }

  async function confirm() {
    const uid = await requireUser();
    if (!uid) return;
    try {
      const res = await api.post<{ confirmations: number; status: string }>(
        `/problems/${id}/confirm`,
      );
      setConfirms(res.confirmations);
      setConfirmed(true);
      toast('Дякуємо! Ваше підтвердження додано.', 'success');
    } catch (e) {
      // 409 = already confirmed → treat as success; anything else is a genuine error.
      if (e instanceof ApiError && e.status === 409) {
        setConfirmed(true);
      } else {
        toast('Не вдалося підтвердити. Спробуйте ще раз.', 'error');
      }
    }
  }

  function openDraft() {
    if (!problem) return;
    setDraftTitle(`Усунути бар’єр: ${problem.title}`);
    setDraftBody(
      `${problem.description ? problem.description + '\n\n' : ''}` +
        `${problem.pointName ? `Локація: ${problem.pointName}.\n` : ''}` +
        `Цей бар’єр уже підтвердили ${confirms} мешканців. Просимо місто усунути його та зробити цю ділянку доступною для людей з інвалідністю та зниженою мобільністю.`,
    );
    setDraftOpen(true);
  }

  async function submitPetition() {
    const uid = await requireUser();
    if (!uid || !problem) return;
    setCreating(true);
    try {
      const pet = await createPetition(problem.id, draftTitle.trim() || `Петиція: ${problem.title}`, draftBody.trim());
      setPetition(pet);
      setDraftOpen(false);
      toast('Петицію створено.', 'success');
    } catch {
      /* leave the draft open so the user can retry */
      toast('Не вдалося створити петицію. Спробуйте ще раз.', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function sign() {
    if (!petition) return;
    const uid = await requireUser();
    if (!uid) return;
    try {
      await api.post(`/petitions/${petition.id}/sign`);
      setSigned(true);
      toast('Ви підписали петицію. Дякуємо!', 'success');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setSigned(true); // already signed
      } else {
        toast('Не вдалося підписати. Спробуйте ще раз.', 'error');
      }
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="civic" />
      <main id="main-content" tabIndex={-1} style={{ flex: 1, maxWidth: 'min(100%, 700px)', width: '100%', margin: '0 auto', padding: '1.4em 1.25em 4em' }}>
        <Link href="/civic" className="sc-foc" style={{ color: 'var(--sc-primary)', fontWeight: 700, textDecoration: 'none', fontSize: '0.9em' }}>
          ‹ До громади
        </Link>

        {status === 'loading' && <div style={{ marginTop: '1em' }}><LoadingState label="Завантаження проблеми" /></div>}
        {status === 'error' && <div style={{ marginTop: '1em' }}><ErrorState onRetry={() => void load()} /></div>}
        {status === 'notfound' && <p style={{ marginTop: '1.5em', color: 'var(--sc-muted)' }}>Проблему не знайдено.</p>}

        {status === 'ready' && problem && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', marginTop: '1em', flexWrap: 'wrap' }}>
              <StatusPill status={problem.status} />
              {problem.pointName ? <span style={{ color: 'var(--sc-muted)', fontSize: '0.85em', minWidth: 0 }}>{problem.pointName}</span> : null}
            </div>
            <h1 style={{ margin: '0.4em 0 0.3em', fontSize: '1.7em', fontWeight: 800, lineHeight: 1.2 }}>{problem.title}</h1>
            {problem.description ? <p style={{ margin: 0, color: 'var(--sc-text)', lineHeight: 1.55 }}>{problem.description}</p> : null}
            {problem.photos.length > 0 ? <div style={{ marginTop: '0.9em' }}><PhotoGallery photos={problem.photos} alt="Фото проблеми" /></div> : null}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em', marginTop: '1.2em', flexWrap: 'wrap' }}>
              <Button onClick={confirm} disabled={confirmed} variant={confirmed ? 'secondary' : 'primary'}>
                {confirmed ? '✓ Ви підтвердили' : 'Я теж це бачу'}
              </Button>
              <span style={{ color: 'var(--sc-muted)', fontWeight: 700 }} aria-live="polite">{confirms} підтверджень</span>
            </div>

            {!petition && confirms >= ESCALATE_AT && (
              <section style={{ marginTop: '1.6em', background: 'var(--sc-warn-bg)', border: 'var(--sc-bw) solid var(--sc-warn-line)', borderRadius: '1em', padding: '1.3em' }}>
                <div style={{ fontSize: '0.78em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sc-warn)' }}>Готово до ескалації</div>
                <h2 style={{ margin: '0.3em 0 0.4em', fontSize: '1.15em', fontWeight: 800 }}>Цей бар’єр підтвердили {confirms} людей</h2>
                <p style={{ margin: '0 0 1em', color: 'var(--sc-muted)', lineHeight: 1.5 }}>
                  Достатньо підтверджень, щоб передати проблему місту. Створіть петицію за готовим чернетковим текстом — його можна відредагувати.
                </p>
                {!draftOpen ? (
                  <Button onClick={openDraft}>Створити петицію</Button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7em' }}>
                    <label style={{ fontWeight: 700, fontSize: '0.85em' }}>
                      Заголовок
                      <input
                        className="sc-foc"
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', marginTop: '0.3em', padding: '0.6em 0.8em', borderRadius: '0.6em', border: 'var(--sc-bw) solid var(--sc-border-strong)', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'inherit', fontSize: '1em' }}
                      />
                    </label>
                    <label style={{ fontWeight: 700, fontSize: '0.85em' }}>
                      Текст звернення
                      <textarea
                        className="sc-foc"
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        rows={5}
                        style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', marginTop: '0.3em', padding: '0.6em 0.8em', borderRadius: '0.6em', border: 'var(--sc-bw) solid var(--sc-border-strong)', background: 'var(--sc-surface)', color: 'var(--sc-text)', fontFamily: 'inherit', fontSize: '1em', resize: 'vertical' }}
                      />
                    </label>
                    <div style={{ display: 'flex', gap: '0.6em', flexWrap: 'wrap' }}>
                      <Button onClick={submitPetition} disabled={creating}>{creating ? 'Створення…' : 'Опублікувати петицію'}</Button>
                      <Button variant="secondary" onClick={() => setDraftOpen(false)}>Скасувати</Button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {petition && (
              <section style={{ marginTop: '1.6em', background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-primary)', borderRadius: '1em', padding: '1.3em' }}>
                <div style={{ fontSize: '0.78em', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sc-primary)' }}>Петиція</div>
                <h2 style={{ margin: '0.3em 0 0.4em', fontSize: '1.2em', fontWeight: 800 }}>{petition.title}</h2>
                {petition.body ? <p style={{ margin: '0 0 1em', color: 'var(--sc-muted)', lineHeight: 1.5 }}>{petition.body}</p> : null}

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', fontWeight: 700, marginBottom: '0.35em', flexWrap: 'wrap', gap: '0.2em 0.6em' }}>
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
