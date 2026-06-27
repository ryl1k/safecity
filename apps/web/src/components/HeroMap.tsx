'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccessibilityFeature, PointSummary, Rating } from '@safecity/shared';
import { computeRating } from '@safecity/shared';
import { useProfile } from '@/profile/ProfileProvider';
import { getCatalog } from '@/lib/catalog';
import { pointsNear } from '@/lib/points';

const LVIV: [number, number] = [24.0316, 49.8419];
const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), { ssr: false });

/** Live Lviv mini-map with real seeded pins, for the landing hero. */
export function HeroMap() {
  const router = useRouter();
  const { primary } = useProfile();
  const [points, setPoints] = useState<PointSummary[]>([]);
  const [catalog, setCatalog] = useState<AccessibilityFeature[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cat, pts] = await Promise.all([getCatalog(), pointsNear(LVIV[0], LVIV[1], 2500)]);
        if (!alive) return;
        setCatalog(cat);
        setPoints(pts);
      } catch {
        /* hero map is decorative — fail quietly */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const markers = points.map((p) => ({
    id: p.id,
    name: p.name,
    lng: p.lng,
    lat: p.lat,
    category: p.category,
    rating: computeRating(p.features, catalog, p.category, primary) as Rating,
  }));

  return (
    <div style={{ height: 380, borderRadius: '1em', overflow: 'hidden', border: 'var(--sc-bw) solid var(--sc-border)', boxShadow: 'var(--sc-shadow-2)' }}>
      <MapView points={markers} center={LVIV} onSelect={(id: string) => router.push(`/point/${id}`)} />
    </div>
  );
}
