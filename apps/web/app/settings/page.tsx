'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui';
import { ThemeSwitcher } from '@/theme/ThemeSwitcher';
import { getMyRole } from '@/lib/admin';
import { supabase } from '@/lib/supabase';

const card = {
  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
  borderRadius: '1em', padding: '1.3em', marginBottom: '1em',
} as const;
const title = { margin: '0 0 0.8em', fontSize: '1.05em', fontWeight: 800 } as const;

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [isModerator, setIsModerator] = useState(false);

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
          <h2 style={title}>Тема</h2>
          <ThemeSwitcher />
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
