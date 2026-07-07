'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Map as MapIcon, List as ListIcon, Megaphone, Plus, type LucideIcon } from 'lucide-react';

// Primary destinations for phones. Mirrors the header nav (minus the conditional
// "Мої точки"); shown only under the mobile breakpoint via .sc-bottom-nav. The
// header's account + accessibility controls stay top-right, so they're omitted here.
const ITEMS: { href: string; icon: LucideIcon; label: string; match: (p: string) => boolean }[] = [
  { href: '/map', icon: MapIcon, label: 'Мапа', match: (p) => p === '/map' },
  { href: '/places', icon: ListIcon, label: 'Місця', match: (p) => p.startsWith('/places') },
  { href: '/problem/new', icon: Megaphone, label: 'Повідомити', match: (p) => p.startsWith('/problem') },
  { href: '/contribute', icon: Plus, label: 'Додати', match: (p) => p.startsWith('/contribute') },
];

export function BottomNav() {
  const pathname = usePathname() ?? '';
  return (
    <nav className="sc-bottom-nav" aria-label="Головна навігація">
      {ITEMS.map((it) => {
        const active = it.match(pathname);
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? 'page' : undefined}
            className="sc-foc"
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '0.15em', textDecoration: 'none', padding: '0.35em 0.2em',
              color: active ? 'var(--sc-primary)' : 'var(--sc-muted)', fontWeight: 700,
            }}
          >
            <Icon size={22} aria-hidden />
            <span style={{ fontSize: '0.68em', lineHeight: 1 }}>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
