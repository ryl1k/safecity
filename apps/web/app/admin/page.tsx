'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, MessageSquareWarning, Star, Users, type LucideIcon } from 'lucide-react';
import { LoadingState } from '@/components/ui';
import { unverifiedPoints, openProblems, recentReviews, listUsers } from '@/lib/admin';

interface Stat {
  href: string;
  label: string;
  icon: LucideIcon;
  value: number | null;
  hint: string;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stat[]>([
    { href: '/admin/unverified', label: 'Непідтверджені місця', icon: BadgeCheck, value: null, hint: 'Очікують перевірки' },
    { href: '/admin/problems', label: 'Відкриті проблеми', icon: MessageSquareWarning, value: null, hint: 'Потребують реакції' },
    { href: '/admin/reviews', label: 'Останні відгуки', icon: Star, value: null, hint: 'За останній час' },
    { href: '/admin/users', label: 'Користувачі', icon: Users, value: null, hint: 'Керування ролями' },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [pts, prs, rvs, usrs] = await Promise.all([
        unverifiedPoints().catch(() => []),
        openProblems().catch(() => []),
        recentReviews().catch(() => []),
        listUsers().catch(() => []),
      ]);
      const counts = [pts.length, prs.length, rvs.length, usrs.length];
      setStats((s) => s.map((x, i) => ({ ...x, value: counts[i] ?? 0 })));
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <h1 style={{ margin: '0 0 0.2em', fontSize: '1.6em', fontWeight: 800 }}>Консоль модерації</h1>
      <p style={{ margin: '0 0 1.4em', color: 'var(--sc-muted)' }}>Огляд черг модерації. Оберіть розділ, щоб опрацювати.</p>
      {loading ? (
        <LoadingState label="Завантаження" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1em' }}>
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="sc-foc sc-lift"
                style={{
                  textDecoration: 'none', color: 'inherit', display: 'block',
                  background: 'var(--sc-surface)', border: 'var(--sc-bw) solid var(--sc-border)',
                  borderRadius: '1em', padding: '1.2em',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55em', color: 'var(--sc-muted)' }}>
                  <Icon size={18} aria-hidden />
                  <span style={{ fontWeight: 700, fontSize: '0.88em' }}>{s.label}</span>
                </div>
                <div style={{ fontSize: '2.1em', fontWeight: 800, marginTop: '0.25em', lineHeight: 1 }}>{s.value}</div>
                <div style={{ color: 'var(--sc-muted)', fontSize: '0.82em', marginTop: '0.4em' }}>{s.hint}</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
