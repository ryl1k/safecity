'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useRef } from 'react';
import type { Category, Rating } from '@safecity/shared';

export interface MapPointMarker {
  id: string;
  name: string;
  lng: number;
  lat: number;
  category: Category;
  rating: Rating;
}

const ratingKey: Record<Rating, string> = { full: 'ok', partial: 'warn', none: 'bad', unknown: 'unk' };
const ratingIcon: Record<Rating, string> = { full: '✓', partial: '◑', none: '✕', unknown: '?' };

// Category = shape. Use clip-path for the diamond (crossing) so the glyph stays upright.
function shapeCss(category: Category): string {
  switch (category) {
    case 'transit': return 'border-radius:6px;';
    case 'crossing': return 'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);';
    case 'toilet': return 'clip-path:polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%);';
    case 'parking': return 'clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%);';
    default: return 'border-radius:50%;';
  }
}

// Clean, muted CARTO basemap (Positron / Dark Matter) — matches the minimal design.
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

export function MapView({
  points,
  center,
  onSelect,
  line,
  userPos,
  follow = false,
}: {
  points: MapPointMarker[];
  center: [number, number];
  onSelect: (id: string) => void;
  line?: [number, number][];
  userPos?: [number, number] | null; // live position dot (navigation)
  follow?: boolean; // keep the map centred on userPos instead of fitting the route
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const onSelectRef = useRef(onSelect);
  const lineRef = useRef(line);
  const followRef = useRef(follow);
  onSelectRef.current = onSelect;
  lineRef.current = line;
  followRef.current = follow;

  // Draw/update the route line + fit it into view. Safe to call repeatedly.
  const applyLine = useCallback(() => {
    const map = mapRef.current;
    const coords = lineRef.current;
    if (!map || !coords || coords.length < 2) return;
    const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } };
    const src = map.getSource('route');
    if (src) {
      src.setData(data);
    } else {
      map.addSource('route', { type: 'geojson', data });
      map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0d5b66', 'line-width': 5 } });
    }
    if (followRef.current) return; // navigation owns the camera — don't fight the follow
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 50, duration: 600 });
  }, []);

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
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      // Draw any route once the style is ready (handles the set-before-init race).
      map.on('load', () => applyLine());
      // Swap basemap on theme change, then re-draw the route (setStyle clears layers).
      observerRef.current = new MutationObserver(() => {
        const d = document.documentElement.getAttribute('data-theme') === 'dark';
        try { map.setStyle(basemapStyle(d) as any); map.once('styledata', () => applyLine()); } catch {}
      });
      observerRef.current.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    })();
    return () => {
      cancelled = true;
      observerRef.current?.disconnect();
      observerRef.current = null;
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

  // Redraw the route when it changes after the map is already up.
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) applyLine();
  }, [line, applyLine]);

  // Live position dot + camera follow during navigation.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      const map = mapRef.current;
      if (cancelled || !map) return;
      if (!userPos) {
        userMarkerRef.current?.remove();
        userMarkerRef.current = null;
        return;
      }
      if (!userMarkerRef.current) {
        const el = document.createElement('div');
        el.setAttribute('aria-label', 'Ваше місцезнаходження');
        el.style.cssText =
          'width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;' +
          'box-shadow:0 0 0 4px rgba(37,99,235,0.28), var(--sc-shadow-2);';
        userMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat(userPos).addTo(map);
      } else {
        userMarkerRef.current.setLngLat(userPos);
      }
      if (follow) map.easeTo({ center: userPos, zoom: Math.max(map.getZoom(), 16.5), duration: 700 });
    })();
    return () => { cancelled = true; };
  }, [userPos, follow]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 360, borderRadius: '1em', overflow: 'hidden' }} />;
}
