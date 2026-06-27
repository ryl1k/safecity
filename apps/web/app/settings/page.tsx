'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Profile } from '@safecity/shared';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { Button, Segmented } from '@/components/ui';
import { ThemeSwitcher } from '@/theme/ThemeSwitcher';
import { useProfile } from '@/profile/ProfileProvider';
import { getMyRole } from '@/lib/admin';
import { supabase } from '@/lib/supabase';

const PROFILE_OPTIONS: { value: Profile; label: string }[] = [
  { value: 'wheelchair', label: 'Крісло колісне' },
  { value: 'blind', label: 'Незрячі / слабкозорі' },
];

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.3em', marginBottom: '1em',
} as const;
const title = { margin: '0 0 0.8em', fontSize: '1.05em', fontWeight: 800 } as const;

export default function SettingsPage() {
  const router = useRouter();
  const { primary, setPrimary, setNeeds } = useProfile();
  const [email, setEmail] = useState<string | null>(null);
  const [isModerator, setIsModerator] = useState(false);

  function changePrimary(p: Profile) {
    setPrimary(p);
    setNeeds([p]); // settings selects a single need; re-run onboarding to pick both
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    getMyRole().then((me) => setIsModerator(me?.role === 'moderator')).catch(() => {});
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setEmail(null);
    router.refresh();
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader />
      <main id="main-content" tabIndex={-1} style={{ width: '100%', maxWidth: 'min(100%, 600px)', margin: '0 auto', padding: '1.6em 1.25em 4em' }}>
        <h1 style={{ margin: '0 0 1em', fontSize: '1.7em', fontWeight: 800 }}>Налаштування</h1>

        <section style={card}>
          <h2 style={title}>Основна потреба</h2>
          <Segmented ariaLabel="Основна потреба" value={primary} onChange={changePrimary} options={PROFILE_OPTIONS} />
          <p style={{ margin: '0.7em 0 0', color: 'var(--sc-muted)', fontSize: '0.85em' }}>
            Визначає вигляд інтерфейсу й оцінки доступності, які ви бачите.
          </p>
          <div style={{ marginTop: '0.8em' }}>
            <Link href="/onboarding" style={{ color: 'var(--sc-primary)', fontWeight: 700, fontSize: '0.9em' }}>Пройти налаштування знову</Link>
          </div>
        </section>

        <section style={card}>
          <h2 style={title}>Вигляд</h2>
          <ThemeSwitcher />
          <p style={{ margin: '0.7em 0 0', color: 'var(--sc-muted)', fontSize: '0.85em' }}>Тема та розмір тексту.</p>
        </section>

        <section style={card}>
          <h2 style={title}>Акаунт</h2>
          {email ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--sc-muted)', minWidth: 0 }}>{email}</span>
              <Button variant="secondary" onClick={signOut} style={{ marginLeft: 'auto' }}>Вийти</Button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--sc-muted)', minWidth: 0 }}>Ви гість. Увійдіть, щоб робити внесок.</span>
              <Link href="/auth" style={{ marginLeft: 'auto', textDecoration: 'none' }}><Button>Увійти</Button></Link>
            </div>
          )}
        </section>

        {isModerator && (
          <section style={card}>
            <h2 style={title}>Модерація</h2>
            <p style={{ margin: '0 0 0.8em', color: 'var(--sc-muted)', fontSize: '0.85em' }}>Перевірка місць, проблем, відгуків і ролей користувачів.</p>
            <Link href="/admin" style={{ textDecoration: 'none' }}><Button>Відкрити консоль модерації</Button></Link>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
