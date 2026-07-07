'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Map as MapIcon, List as ListIcon, Megaphone, Plus, MapPin, type LucideIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { businessMe } from '@/lib/business';

// Primary destinations for phones. Shown only under the mobile breakpoint via
// .sc-bottom-nav. The header's account + accessibility controls stay top-right,
// so they're omitted here. "Мої точки" is appended for users who own points.
type Item = { href: string; icon: LucideIcon; label: string; match: (p: string) => boolean };
const ITEMS: Item[] = [
  { href: '/map', icon: MapIcon, label: 'Мапа', match: (p) => p === '/map' },
  { href: '/places', icon: ListIcon, label: 'Місця', match: (p) => p.startsWith('/places') },
  { href: '/problem/new', icon: Megaphone, label: 'Повідомити', match: (p) => p.startsWith('/problem') },
  { href: '/contribute', icon: Plus, label: 'Додати', match: (p) => p.startsWith('/contribute') },
];
const MY_POINTS: Item = { href: '/business', icon: MapPin, label: 'Мої точки', match: (p) => p.startsWith('/business') };

export function BottomNav() {
  const pathname = usePathname() ?? '';
  // "Мої точки" appears once the signed-in user owns at least one point.
  const [ownsPoints, setOwnsPoints] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = (signed: boolean) => {
      if (!signed) { setOwnsPoints(false); return; }
      businessMe()
        .then((m) => { if (alive) setOwnsPoints(m.points.length > 0); })
        .catch(() => {});
    };
    supabase.auth.getUser().then(({ data }) => refresh(Boolean(data.user)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => refresh(Boolean(session?.user)));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const items = ownsPoints ? [...ITEMS, MY_POINTS] : ITEMS;
  return (
    <nav className="sc-bottom-nav" aria-label="Головна навігація">
      {items.map((it) => {
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
