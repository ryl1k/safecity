'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, BadgeCheck, MessageSquareWarning, Star, Users, type LucideIcon } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { Button, LoadingState, ErrorState } from '@/components/ui';
import { getMyRole } from '@/lib/admin';
import { AdminContext, type AdminGate } from '@/lib/adminContext';

const NAV: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: '/admin', label: 'Огляд', icon: LayoutDashboard, exact: true },
  { href: '/admin/unverified', label: 'Непідтверджені', icon: BadgeCheck },
  { href: '/admin/problems', label: 'Проблеми', icon: MessageSquareWarning },
  { href: '/admin/reviews', label: 'Відгуки', icon: Star },
  { href: '/admin/users', label: 'Користувачі', icon: Users },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<AdminGate>('loading');
  const [meId, setMeId] = useState<string>('');
  const pathname = usePathname();

  useEffect(() => {
    (async () => {
      try {
        const who = await getMyRole();
        if (!who) return setGate('guest');
        if (who.role !== 'moderator') return setGate('denied');
        setMeId(who.userId);
        setGate('ok');
      } catch {
        setGate('error');
      }
    })();
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader />
      <div className="sc-biz-grid" style={{ flex: 1, width: '100%', maxWidth: 1280, margin: '0 auto', padding: '1.4em 1.25em 3em' }}>
        <aside className="sc-biz-side">
          <nav aria-label="Консоль модерації" style={{ display: 'flex', flexDirection: 'column', gap: '0.25em' }}>
            {NAV.map((n) => {
              const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? 'page' : undefined}
                  className="sc-foc"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.55em',
                    padding: '0.6em 0.9em', borderRadius: '0.6em', textDecoration: 'none', fontWeight: 700, fontSize: '0.92em',
                    color: active ? 'var(--sc-primary)' : 'var(--sc-text)',
                    background: active ? 'var(--sc-primary-tint)' : 'transparent',
                  }}
                >
                  <Icon size={17} aria-hidden />
                  <span style={{ flex: 1 }}>{n.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main id="main-content" tabIndex={-1} style={{ flex: 1, minWidth: 0 }}>
          {gate === 'loading' && <LoadingState label="Перевірка доступу" />}
          {gate === 'error' && <ErrorState onRetry={() => location.reload()} />}
          {gate === 'guest' && (
            <section style={{ background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '1.3em' }}>
              <p style={{ margin: '0 0 1em' }}>Увійдіть як модератор, щоб відкрити консоль.</p>
              <Link href="/auth?next=/admin" style={{ textDecoration: 'none' }}><Button>Увійти</Button></Link>
            </section>
          )}
          {gate === 'denied' && (
            <section style={{ background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '1.3em' }}>
              <p style={{ margin: 0, fontWeight: 700 }}>Доступ лише для модераторів.</p>
              <p style={{ margin: '0.5em 0 0', color: 'var(--sc-muted)', fontSize: '0.9em' }}>
                Призначити роль можна командою <code>pnpm db:make-admin &lt;ваша-пошта&gt;</code>.
              </p>
            </section>
          )}
          {gate === 'ok' && <AdminContext.Provider value={{ meId }}>{children}</AdminContext.Provider>}
        </main>
      </div>
      <Footer />
    </div>
  );
}
