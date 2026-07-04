'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, MapPin, BarChart3, CreditCard, type LucideIcon } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { Button, LoadingState, ErrorState } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { businessMe, type BusinessMe } from '@/lib/business';
import { BusinessContext, type BusinessGate } from '@/lib/businessContext';

const NAV: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: '/business', label: 'Огляд', icon: LayoutDashboard, exact: true },
  { href: '/business/points', label: 'Мої точки', icon: MapPin },
  { href: '/business/analytics', label: 'Аналітика', icon: BarChart3 },
  { href: '/business/subscription', label: 'Підписка', icon: CreditCard },
];

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<BusinessGate>('loading');
  const [me, setMe] = useState<BusinessMe | null>(null);
  const pathname = usePathname();

  const reload = useCallback(async () => {
    try {
      setMe(await businessMe());
      setGate('ok');
    } catch {
      setGate('error');
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setGate('guest');
        return;
      }
      await reload();
    })();
  }, [reload]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="business" />
      <div className="sc-biz-grid" style={{ flex: 1, width: '100%', maxWidth: 1120, margin: '0 auto', padding: '1.4em 1.25em 3em' }}>
        <aside className="sc-biz-side">
          <nav aria-label="Панель бізнесу" style={{ display: 'flex', flexDirection: 'column', gap: '0.25em' }}>
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
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main id="main-content" tabIndex={-1} style={{ flex: 1, minWidth: 0 }}>
          {gate === 'loading' && <LoadingState label="Завантаження панелі" />}
          {gate === 'error' && <ErrorState onRetry={() => void reload()} />}
          {gate === 'guest' && (
            <section style={{ background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)', borderRadius: '1em', padding: '1.3em' }}>
              <p style={{ margin: '0 0 1em' }}>Увійдіть, щоб керувати бізнес-акаунтом.</p>
              <Link href="/auth?next=/business" style={{ textDecoration: 'none' }}><Button>Увійти</Button></Link>
            </section>
          )}
          {gate === 'ok' && me && (
            <BusinessContext.Provider value={{ me, reload }}>{children}</BusinessContext.Provider>
          )}
        </main>
      </div>
      <Footer />
    </div>
  );
}
