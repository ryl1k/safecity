'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { Category, Rating } from '@safecity/shared';

export interface ExploreMarker {
  id: string;
  name: string;
  lng: number;
  lat: number;
  category: Category;
  rating: Rating;
}

export interface ExploreProblem {
  id: string;
  title: string;
  lng: number;
  lat: number;
}

export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

const ratingKey: Record<Rating, string> = { full: 'ok', partial: 'warn', none: 'bad', unknown: 'unk' };
const ratingIcon: Record<Rating, string> = { full: '✓', partial: '◑', none: '✕', unknown: '?' };

// Category = shape (mirrors the design's pin set + MapView). Diamond via clip-path
// so the rating glyph stays upright.
function shapeCss(category: Category): string {
  switch (category) {
    case 'transit': return 'border-radius:6px;';
    case 'crossing': return 'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);';
    case 'toilet': return 'clip-path:polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%);';
    case 'parking': return 'clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%);';
    default: return 'border-radius:50%;';
  }
}

function basemapStyle(dark: boolean) {
  const variant = dark ? 'dark_all' : 'light_all';
  return {
    version: 8 as const,
    sources: {
      carto: {
        type: 'raster' as const,
        tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}{r}.png`),
        tileSize: 256,
        attribution: '© OpenStreetMap © CARTO',
      },
    },
    layers: [{ id: 'carto', type: 'raster' as const, source: 'carto' }],
  };
}

/**
 * Immersive full-viewport map for /explore. Fills its parent, reports the visible
 * bbox on pan/zoom (debounced), and flies to `focus` when it changes.
 */
export function ExploreMap({
  points,
  problems = [],
  center,
  onSelect,
  onSelectProblem,
  onMoveEnd,
  focus,
}: {
  points: ExploreMarker[];
  problems?: ExploreProblem[];
  center: [number, number];
  onSelect: (id: string) => void;
  onSelectProblem?: (id: string) => void;
  onMoveEnd?: (b: Bbox) => void;
  focus?: { lng: number; lat: number; nonce: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const problemMarkersRef = useRef<any[]>([]);
  const onSelectRef = useRef(onSelect);
  const onSelectProblemRef = useRef(onSelectProblem);
  const onMoveEndRef = useRef(onMoveEnd);
  onSelectRef.current = onSelect;
  onSelectProblemRef.current = onSelectProblem;
  onMoveEndRef.current = onMoveEnd;

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const dark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: basemapStyle(dark) as any,
        center,
        zoom: 14,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.addControl(
        new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }),
        'bottom-right',
      );

      const emit = () => {
        const b = map.getBounds();
        onMoveEndRef.current?.({
          minLng: b.getWest(),
          minLat: b.getSouth(),
          maxLng: b.getEast(),
          maxLat: b.getNorth(),
        });
      };
      map.on('load', emit);
      map.on('moveend', emit);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers when points change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      const map = mapRef.current;
      if (cancelled || !map) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = points.map((p) => {
        const el = document.createElement('button');
        el.className = 'sc-foc';
        el.type = 'button';
        el.setAttribute('aria-label', p.name);
        el.style.cssText =
          `width:28px;height:28px;display:grid;place-items:center;font-weight:800;color:#fff;` +
          `border:2px solid #fff;box-shadow:var(--sc-shadow-2);cursor:pointer;background:var(--sc-${ratingKey[p.rating]});` +
          shapeCss(p.category);
        const inner = document.createElement('span');
        inner.textContent = ratingIcon[p.rating];
        el.appendChild(inner);
        el.addEventListener('click', () => onSelectRef.current(p.id));
        return new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [points]);

  // Sync the problems layer (distinct warning markers) when it changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      const map = mapRef.current;
      if (cancelled || !map) return;
      problemMarkersRef.current.forEach((m) => m.remove());
      problemMarkersRef.current = problems.map((pr) => {
        const el = document.createElement('button');
        el.className = 'sc-foc';
        el.type = 'button';
        el.setAttribute('aria-label', `Проблема: ${pr.title}`);
        el.style.cssText =
          `width:26px;height:26px;display:grid;place-items:center;font-weight:800;color:#fff;font-size:14px;` +
          `border:2px solid #fff;box-shadow:var(--sc-shadow-2);cursor:pointer;background:var(--sc-bad);` +
          `clip-path:polygon(50% 0,100% 100%,0 100%);`;
        el.textContent = '!';
        el.addEventListener('click', () => onSelectProblemRef.current?.(pr.id));
        return new maplibregl.Marker({ element: el }).setLngLat([pr.lng, pr.lat]).addTo(map);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [problems]);

  // Fly to a chosen search result.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(map.getZoom(), 16), duration: 800 });
  }, [focus]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
