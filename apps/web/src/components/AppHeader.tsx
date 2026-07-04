'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { Map as MapIcon, List as ListIcon, Megaphone, Plus, CircleUserRound, type LucideIcon } from 'lucide-react';
import { AccessibilityMenu } from '@/components/AccessibilityMenu';
import { supabase } from '@/lib/supabase';

export function AppHeader({ active, search }: { active?: 'map' | 'places' | 'civic' | 'problem'; search?: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(Boolean(session?.user)));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 30, background: 'var(--sc-surface)',
        borderBottom: 'var(--sc-bw) solid var(--sc-border)',
      }}
    >
      <div
        style={{
          maxWidth: 1080, margin: '0 auto', padding: '0.55em 1.25em',
          display: 'flex', alignItems: 'center', gap: '0.6em 1.2em', flexWrap: 'wrap',
        }}
      >
        <Link
          href="/"
          className="sc-foc"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5em', textDecoration: 'none', color: 'var(--sc-text)' }}
        >
          <span aria-hidden style={{ width: '2em', height: '2em', borderRadius: '0.5em', background: 'var(--sc-primary)', color: 'var(--sc-on-primary)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>◍</span>
          <span style={{ fontWeight: 800, fontSize: '1.05em' }}>SafeCity</span>
        </Link>

        <nav aria-label="Головна навігація" className="sc-header-nav" style={{ display: 'flex', gap: '0.2em', alignItems: 'center', flexWrap: 'wrap' }}>
          <NavLink href="/map" icon={MapIcon} label="Мапа" current={active === 'map'} />
          <NavLink href="/places" icon={ListIcon} label="Місця" current={active === 'places'} />
          <NavLink href="/problem/new" icon={Megaphone} label="Повідомити" current={active === 'problem'} />
          <NavLink href="/contribute" icon={Plus} label="Додати" />
        </nav>

        {/* Optional search slot (desktop map view puts its search here). */}
        {search ? (
          <div style={{ flex: 1, minWidth: 220, maxWidth: 720, position: 'relative' }}>{search}</div>
        ) : null}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.6em', flexWrap: 'wrap' }}>
          <AccessibilityMenu />
          <Link
            href={signedIn ? '/settings' : '/auth'}
            aria-label={signedIn ? 'Акаунт' : 'Увійти'}
            className="sc-foc"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.45em', minHeight: '2.5em', padding: '0 0.9em',
              borderRadius: '0.6em', textDecoration: 'none', fontWeight: 700,
              background: signedIn ? 'var(--sc-surface)' : 'var(--sc-primary)',
              color: signedIn ? 'var(--sc-text)' : 'var(--sc-on-primary)',
              border: signedIn ? 'var(--sc-bw) solid var(--sc-border-strong)' : 'none',
            }}
          >
            <CircleUserRound size={18} aria-hidden />
            <span className="sc-hide-sm" style={{ fontSize: '0.9em' }}>{signedIn ? 'Акаунт' : 'Увійти'}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, icon: Icon, label, current }: { href: string; icon: LucideIcon; label: string; current?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="sc-foc"
      aria-current={current ? 'page' : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.4em', minHeight: '2.5em', padding: '0 0.7em',
        borderRadius: '0.6em', textDecoration: 'none', fontWeight: 700, fontSize: '0.9em',
        color: current ? 'var(--sc-primary)' : 'var(--sc-muted)',
        background: current ? 'var(--sc-primary-tint)' : 'transparent',
      }}
    >
      <Icon size={18} aria-hidden />
      <span className="sc-hide-sm">{label}</span>
    </Link>
  );
}
