'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, MapPin, ShieldCheck, BarChart3, CreditCard, Lock, type LucideIcon } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { BusinessPaywall } from '@/components/BusinessPaywall';
import { Button, LoadingState, ErrorState } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { businessMe, type BusinessMe } from '@/lib/business';
import { BusinessContext, type BusinessGate } from '@/lib/businessContext';

// `premium` pages are blurred behind a paywall for free-tier users. Overview and
// "Мої точки" stay free (a free user must still manage their own points), and
// Підписка is ALWAYS open — it is the only way to upgrade.
const NAV: { href: string; label: string; icon: LucideIcon; exact?: boolean; premium?: boolean }[] = [
  { href: '/business', label: 'Огляд', icon: LayoutDashboard, exact: true },
  { href: '/business/points', label: 'Мої точки', icon: MapPin },
  { href: '/business/accessibility', label: 'Доступність', icon: ShieldCheck, premium: true },
  { href: '/business/analytics', label: 'Аналітика', icon: BarChart3, premium: true },
  { href: '/business/subscription', label: 'Підписка', icon: CreditCard },
];

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<BusinessGate>('loading');
  const [me, setMe] = useState<BusinessMe | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const pathname = usePathname();

  // Keep the shared selection valid: default to the first point, and reset if the
  // current one disappears (deleted, or a different account signed in).
  useEffect(() => {
    if (!me) return;
    const ids = me.points.map((p) => p.id);
    setSelectedPointId((cur) => (cur && ids.includes(cur) ? cur : ids[0] ?? null));
  }, [me]);

  const load = useCallback(async (fresh: boolean) => {
    try {
      setMe(await businessMe(fresh));
      setGate('ok');
    } catch {
      setGate('error');
    }
  }, []);
  // Exposed via context — always refetches so the dashboard reflects the latest
  // after a mutation (subscribe, delete, verify request).
  const reload = useCallback(() => load(true), [load]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setGate('guest');
        return;
      }
      await load(false);
    })();
  }, [load]);

  const activeNav = NAV.find((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href)));
  const locked = Boolean(activeNav?.premium) && me != null && !me.isBusiness;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="business" />
      <div className="sc-biz-grid" style={{ flex: 1, width: '100%', maxWidth: 1280, margin: '0 auto', padding: '1.4em 1.25em 3em' }}>
        <aside className="sc-biz-side">
          <nav aria-label="Панель бізнесу" style={{ display: 'flex', flexDirection: 'column', gap: '0.25em' }}>
            {NAV.map((n) => {
              const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
              const Icon = n.icon;
              const showLock = Boolean(n.premium) && me != null && !me.isBusiness;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? 'page' : undefined}
                  className="sc-foc"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.55em',
                    padding: '0.6em 0.9em', borderRadius: '0.6em', textDecoration: 'none', fontWeight: 700, fontSize: '0.92em',
                    color: active ? 'var(--sc-primary)' : showLock ? 'var(--sc-muted)' : 'var(--sc-text)',
                    background: active ? 'var(--sc-primary-tint)' : 'transparent',
                  }}
                >
                  <Icon size={17} aria-hidden />
                  <span style={{ flex: 1 }}>{n.label}</span>
                  {showLock && <Lock size={13} aria-label="Для бізнес-акаунтів" style={{ opacity: 0.7 }} />}
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
            <BusinessContext.Provider value={{ me, reload, selectedPointId, setSelectedPointId }}>
              {locked ? <BusinessPaywall /> : children}
            </BusinessContext.Provider>
          )}
        </main>
      </div>
      <Footer />
    </div>
  );
}
