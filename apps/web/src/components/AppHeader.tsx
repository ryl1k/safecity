'use client';

import Link from 'next/link';
import type { Profile } from '@safecity/shared';
import { ThemeSwitcher } from '@/theme/ThemeSwitcher';
import { Segmented } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';

const PROFILE_OPTIONS: { value: Profile; label: string }[] = [
  { value: 'wheelchair', label: 'Крісло' },
  { value: 'blind', label: 'Незрячі' },
];

export function AppHeader({ active }: { active?: 'map' | 'civic' }) {
  const { primary, setPrimary } = useProfile();
  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 30, background: 'var(--sc-surface)',
        borderBottom: 'var(--sc-bw) solid var(--sc-border)',
      }}
    >
      <div
        style={{
          maxWidth: 1080, margin: '0 auto', padding: '0.6em 1.25em',
          display: 'flex', alignItems: 'center', gap: '1em', flexWrap: 'wrap',
        }}
      >
        <Link
          href="/"
          className="sc-foc"
          style={{ display: 'flex', alignItems: 'center', gap: '0.55em', textDecoration: 'none', color: 'var(--sc-text)' }}
        >
          <span
            aria-hidden
            style={{
              width: '2.1em', height: '2.1em', borderRadius: '0.55em', background: 'var(--sc-primary)',
              color: 'var(--sc-on-primary)', display: 'grid', placeItems: 'center', fontWeight: 800,
            }}
          >
            ◍
          </span>
          <span style={{ fontWeight: 800 }}>SafeCity</span>
        </Link>

        <nav aria-label="Розділи" style={{ display: 'flex', gap: '0.3em' }}>
          <HeaderLink href="/map" current={active === 'map'}>Мапа</HeaderLink>
          <HeaderLink href="/civic" current={active === 'civic'}>Громада</HeaderLink>
          <HeaderLink href="/contribute">Додати</HeaderLink>
          <HeaderLink href="/settings">Налаштування</HeaderLink>
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.8em', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 170 }}>
            <Segmented
              ariaLabel="Профіль доступності"
              value={primary}
              onChange={setPrimary}
              options={PROFILE_OPTIONS}
            />
          </div>
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}

function HeaderLink({ href, current, children }: { href: string; current?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="sc-foc"
      aria-current={current ? 'page' : undefined}
      style={{
        fontSize: '0.9em', fontWeight: 700, textDecoration: 'none',
        padding: '0.4em 0.7em', borderRadius: '0.5em',
        color: current ? 'var(--sc-primary)' : 'var(--sc-muted)',
        background: current ? 'var(--sc-primary-tint)' : 'transparent',
      }}
    >
      {children}
    </Link>
  );
}
