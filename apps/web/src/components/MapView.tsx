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

// Quadratic bezier from a → b. bowSign +1 = CCW perp, -1 = CW perp.
function bezierConnector(a: [number, number], b: [number, number], bowSign = 1, steps = 24): [number, number][] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [a, b];
  const bow = len * 0.35;
  const ctrl: [number, number] = [
    (a[0] + b[0]) / 2 - bowSign * (dy / len) * bow,
    (a[1] + b[1]) / 2 + bowSign * (dx / len) * bow,
  ];
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0], u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1]]);
  }
  return pts;
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
  connectors,
  routeEndpoints,
  userPos,
  follow = false,
}: {
  points: MapPointMarker[];
  center: [number, number];
  onSelect: (id: string) => void;
  line?: [number, number][];
  connectors?: [[number, number], [number, number]][]; // dashed "walk to route" lines
  routeEndpoints?: { start?: [number, number]; end?: [number, number] };
  userPos?: [number, number] | null;
  follow?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const onSelectRef = useRef(onSelect);
  const lineRef = useRef(line);
  const connectorsRef = useRef(connectors);
  const routeEndpointsRef = useRef(routeEndpoints);
  const followRef = useRef(follow);
  onSelectRef.current = onSelect;
  lineRef.current = line;
  connectorsRef.current = connectors;
  routeEndpointsRef.current = routeEndpoints;
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
    // Route perpendicular direction — used to bow each connector AWAY from the road.
    const routeFirst = coords[0];
    const routeLast = coords[coords.length - 1];
    const rdx = (routeLast?.[0] ?? 0) - (routeFirst?.[0] ?? 0);
    const rdy = (routeLast?.[1] ?? 0) - (routeFirst?.[1] ?? 0);
    const rlen = Math.sqrt(rdx * rdx + rdy * rdy);
    const perpX = rlen > 0 ? -rdy / rlen : 0;
    const perpY = rlen > 0 ? rdx / rlen : 0;

    // Connector dotted curves (tapped point → route start, route end → destination).
    const connData = {
      type: 'FeatureCollection' as const,
      features: (connectorsRef.current ?? []).map(([a, b]) => {
        // Identify which endpoint is off-road by checking proximity to route endpoints.
        const eps = 1e-5;
        const aOnRoute =
          (routeFirst && Math.abs(a[0] - routeFirst[0]) < eps && Math.abs(a[1] - routeFirst[1]) < eps) ||
          (routeLast  && Math.abs(a[0] - routeLast[0])  < eps && Math.abs(a[1] - routeLast[1])  < eps);
        const offRoad = aOnRoute ? b : a;
        const onRoad  = aOnRoute ? a : b;
        // bow toward the side where the off-road point sits relative to the route
        const dot = (offRoad[0] - onRoad[0]) * perpX + (offRoad[1] - onRoad[1]) * perpY;
        const bowSign = dot >= 0 ? 1 : -1;
        return {
          type: 'Feature' as const, properties: {},
          geometry: { type: 'LineString' as const, coordinates: bezierConnector(a, b, bowSign) },
        };
      }),
    };
    const connSrc = map.getSource('route-connectors');
    if (connSrc) {
      connSrc.setData(connData);
    } else {
      map.addSource('route-connectors', { type: 'geojson', data: connData });
      map.addLayer({ id: 'route-connectors', type: 'line', source: 'route-connectors',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        // [0, N] dasharray with round caps = evenly-spaced circular dots
        paint: { 'line-color': '#7cb9f0', 'line-width': 7, 'line-opacity': 0.85, 'line-dasharray': [0, 1.8] },
      }, 'route');
    }

    // Start / finish dot markers.
    const ep = routeEndpointsRef.current;
    const epFeatures = [
      ep?.start ? { type: 'Feature' as const, properties: { kind: 'start' }, geometry: { type: 'Point' as const, coordinates: ep.start } } : null,
      ep?.end   ? { type: 'Feature' as const, properties: { kind: 'end'   }, geometry: { type: 'Point' as const, coordinates: ep.end   } } : null,
    ].filter(Boolean);
    const epData = { type: 'FeatureCollection' as const, features: epFeatures as any[] };
    const epSrc = map.getSource('route-endpoints');
    if (epSrc) {
      epSrc.setData(epData);
    } else {
      map.addSource('route-endpoints', { type: 'geojson', data: epData });
      map.addLayer({ id: 'route-endpoints', type: 'circle', source: 'route-endpoints',
        paint: {
          'circle-radius': ['match', ['get', 'kind'], 'end', 9, 8],
          'circle-color': ['match', ['get', 'kind'], 'start', '#ffffff', '#1d4ed8'],
          'circle-stroke-color': ['match', ['get', 'kind'], 'start', '#1d4ed8', '#ffffff'],
          'circle-stroke-width': 2.5,
        },
      });
    }

    if (followRef.current) return; // navigation owns the camera — don't fight the follow
    const allCoords = [...coords, ...(connectorsRef.current ?? []).flat()];
    const lngs = allCoords.map((c) => c[0]);
    const lats = allCoords.map((c) => c[1]);
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
