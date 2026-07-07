'use client';

import { use } from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { Footer } from '@/components/Footer';
import { PointDetailContent } from '@/components/PointDetailContent';

export default function PointDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader active="map" />
      <main id="main-content" tabIndex={-1} style={{ flex: 1, width: '100%', maxWidth: 760, margin: '0 auto', padding: '1.4em 1.25em 4em' }}>
        <Link href="/map" className="sc-foc" style={{ color: 'var(--sc-primary)', fontWeight: 700, textDecoration: 'none', fontSize: '0.9em' }}>
          ‹ До мапи
        </Link>
        <div style={{ marginTop: '0.8em' }}>
          <PointDetailContent id={id} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
