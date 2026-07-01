'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Category } from '@safecity/shared';
import { PLACE_META, placeKind, type PlaceKind } from '@/lib/placeKind';

// Pre-render every place-kind's lucide icon to a white SVG string (for DOM markers).
const ICON_SVG: Record<PlaceKind, string> = (Object.keys(PLACE_META) as PlaceKind[]).reduce(
  (acc, k) => {
    const Icon = PLACE_META[k].Icon;
    acc[k] = renderToStaticMarkup(<Icon size={17} color="#fff" strokeWidth={2.5} />);
    return acc;
  },
  {} as Record<PlaceKind, string>,
);

export interface ExploreMarker {
  id: string;
  name: string;
  lng: number;
  lat: number;
  category: Category;
  accessible: boolean; // mobility-accessible (full/partial) for the active profile
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
  zoom: number;
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

function buildMarkerEl(p: ExploreMarker, onSelect: (id: string) => void): HTMLElement {
  const kind = placeKind(p.category, p.name);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;';

  const pin = document.createElement('button');
  pin.className = 'sc-foc';
  pin.type = 'button';
  pin.setAttribute('aria-label', p.name);
  pin.style.cssText =
    'width:30px;height:30px;border-radius:50%;display:grid;place-items:center;cursor:pointer;' +
    `background:${PLACE_META[kind].color};border:2px solid var(--sc-surface);` +
    `box-shadow:${p.accessible ? '0 0 0 2px var(--sc-ok),' : ''}var(--sc-shadow-2);`;
  pin.innerHTML = ICON_SVG[kind];
  pin.addEventListener('click', () => onSelect(p.id));

  const label = document.createElement('div');
  label.textContent = p.name;
  label.style.cssText =
    'max-width:130px;margin-top:2px;font-size:11px;font-weight:700;line-height:1.15;' +
    'color:var(--sc-text);background:var(--sc-surface);border:var(--sc-bw) solid var(--sc-border);' +
    'border-radius:6px;padding:1px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
    'box-shadow:var(--sc-shadow-1);';

  wrap.appendChild(pin);
  wrap.appendChild(label);
  return wrap;
}

/**
 * Immersive full-viewport map. Category/sub-type-coloured pins with always-on
 * text labels. Markers are reconciled by id (existing pins stay put on pan —
 * only new ones are added and gone ones removed), so panning never flickers.
 */
export function ExploreMap({
  points,
  problems = [],
  center,
  onSelect,
  onSelectProblem,
  onMoveEnd,
  focus,
  pickMode = false,
  onMapClick,
  line,
}: {
  points: ExploreMarker[];
  problems?: ExploreProblem[];
  center: [number, number];
  onSelect: (id: string) => void;
  onSelectProblem?: (id: string) => void;
  onMoveEnd?: (b: Bbox) => void;
  focus?: { lng: number; lat: number; nonce: number } | null;
  pickMode?: boolean;
  onMapClick?: (lng: number, lat: number) => void;
  line?: [number, number][];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersById = useRef<Map<string, any>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const problemMarkersRef = useRef<any[]>([]);
  const observerRef = useRef<MutationObserver | null>(null);
  const onSelectRef = useRef(onSelect);
  const onSelectProblemRef = useRef(onSelectProblem);
  const onMoveEndRef = useRef(onMoveEnd);
  const pickModeRef = useRef(pickMode);
  const onMapClickRef = useRef(onMapClick);
  const lineRef = useRef(line ?? []);
  onSelectRef.current = onSelect;
  onSelectProblemRef.current = onSelectProblem;
  onMoveEndRef.current = onMoveEnd;
  pickModeRef.current = pickMode;
  onMapClickRef.current = onMapClick;
  lineRef.current = line ?? [];

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const dark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: basemapStyle(dark) as never,
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
          zoom: map.getZoom(),
        });
      };
      map.on('load', emit);
      map.on('moveend', emit);
      map.on('click', (e: any) => {
        if (pickModeRef.current) onMapClickRef.current?.(e.lngLat.lng, e.lngLat.lat);
      });

      // Re-add route layer after style reload (dark/light mode wipes all sources).
      map.on('style.load', () => {
        const coords = lineRef.current;
        if (coords.length < 2) return;
        try {
          map.addSource('sc-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } });
          map.addLayer({ id: 'sc-route', type: 'line', source: 'sc-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 5, 'line-opacity': 0.85 } });
        } catch {}
      });

      observerRef.current = new MutationObserver(() => {
        const d = document.documentElement.getAttribute('data-theme') === 'dark';
        try {
          map.setStyle(basemapStyle(d) as never);
        } catch {
          /* ignore */
        }
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

  // Reconcile markers by id — add new, remove gone, leave existing untouched.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      const map = mapRef.current;
      if (cancelled || !map) return;
      const incoming = new Set(points.map((p) => p.id));
      for (const [id, marker] of markersById.current) {
        if (!incoming.has(id)) {
          marker.remove();
          markersById.current.delete(id);
        }
      }
      for (const p of points) {
        if (markersById.current.has(p.id)) continue;
        const el = buildMarkerEl(p, (id) => onSelectRef.current(id));
        markersById.current.set(p.id, new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [points]);

  // Sync the problems layer (distinct warning markers).
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
          'width:26px;height:26px;display:grid;place-items:center;font-weight:800;color:#fff;font-size:14px;' +
          'border:2px solid #fff;box-shadow:var(--sc-shadow-2);cursor:pointer;background:var(--sc-bad);' +
          'clip-path:polygon(50% 0,100% 100%,0 100%);';
        el.textContent = '!';
        el.addEventListener('click', () => onSelectProblemRef.current?.(pr.id));
        return new maplibregl.Marker({ element: el }).setLngLat([pr.lng, pr.lat]).addTo(map);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [problems]);

  // Draw / update the route line on the real map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const coords = line ?? [];
    const geojson: any = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
    const trySync = () => {
      try {
        if (map.getSource('sc-route')) {
          (map.getSource('sc-route') as any).setData(geojson);
        } else if (coords.length >= 2) {
          map.addSource('sc-route', { type: 'geojson', data: geojson });
          map.addLayer({ id: 'sc-route', type: 'line', source: 'sc-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 5, 'line-opacity': 0.85 } });
        }
      } catch {}
    };
    if (map.isStyleLoaded()) trySync(); else map.once('load', trySync);
  }, [line]);

  // Switch cursor to crosshair when in pick mode.
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas() as HTMLCanvasElement | undefined;
    if (canvas) canvas.style.cursor = pickMode ? 'crosshair' : '';
  }, [pickMode]);

  // Fly to a chosen search result.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(map.getZoom(), 16), duration: 800 });
  }, [focus]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
