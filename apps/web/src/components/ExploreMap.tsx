'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AccessLevel, Category } from '@safecity/shared';
import { PLACE_META, placeKind, type PlaceKind } from '@/lib/placeKind';

// Pre-render every place-kind's lucide icon to a white SVG string.
const ICON_INNER: Record<PlaceKind, string> = (Object.keys(PLACE_META) as PlaceKind[]).reduce(
  (acc, k) => {
    const Icon = PLACE_META[k].Icon;
    acc[k] = renderToStaticMarkup(<Icon size={18} color="#fff" strokeWidth={2.6} />);
    return acc;
  },
  {} as Record<PlaceKind, string>,
);

// Accessibility-level pin colours (the pin body IS the level highlight; the icon
// glyph still says what kind of place it is).
const LEVEL_HEX: Record<AccessLevel, string> = {
  high: '#16a34a',
  medium: '#d97706',
  low: '#dc2626',
  unknown: '#9ca3af',
};

// A teardrop map pin filled with the accessibility-level colour + white category
// icon, as a data URL for map.addImage.
function pinDataUrl(kind: PlaceKind, color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52">` +
    `<path d="M20 50C12 38 3 30 3 18A17 17 0 1 1 37 18C37 30 28 38 20 50Z" fill="${color}" stroke="#fff" stroke-width="2.5"/>` +
    `<g transform="translate(11,9)">${ICON_INNER[kind]}</g>` +
    `</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export interface ExploreMarker {
  id: string;
  name: string;
  lng: number;
  lat: number;
  category: Category;
  level: AccessLevel; // wheelchair accessibility level → coloured halo under the pin
}

export interface ExploreProblem {
  id: string;
  title: string;
  lng: number;
  lat: number;
}

export interface ExploreSegment {
  id: string;
  streetName: string;
  rating: 'full' | 'partial' | 'none' | 'unknown';
  geojson: string; // GeoJSON LineString geometry string
}

export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  zoom: number;
}

// A styled route rendering: multiple lines (walk legs dashed, transit legs
// solid, alternatives muted) + marker cues (start/end, board/alight stops).
export interface RouteLineStyle {
  coords: [number, number][];
  color: string;
  width: number;
  opacity: number;
  dash?: boolean;
  sort?: number; // higher renders on top (selected itinerary above alternatives)
}
export interface RouteMarkerCue {
  lng: number;
  lat: number;
  kind: 'start' | 'end' | 'board' | 'alight';
  label?: string;
}
export interface RouteDisplay {
  lines: RouteLineStyle[];
  markers: RouteMarkerCue[];
}

function basemapStyle(dark: boolean) {
  const variant = dark ? 'dark_all' : 'light_all';
  return {
    version: 8 as const,
    // Glyphs are required for symbol text (cluster counts + pin labels). MapLibre's
    // CDN serves Noto Sans (incl. Cyrillic); openmaptiles' font server now 404s.
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function featureCollection(points: ExploreMarker[]): any {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { id: p.id, name: p.name, icon: `${placeKind(p.category, p.name)}::${p.level}` },
    })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function segmentCollection(segs: ExploreSegment[]): any {
  return {
    type: 'FeatureCollection',
    // Don't draw streets we have no accessibility data for — an "unknown" grey
    // line adds noise without telling the user anything.
    features: segs
      .filter((s) => s.rating !== 'unknown')
      .map((s) => ({
        type: 'Feature',
        geometry: JSON.parse(s.geojson),
        properties: { id: s.id, street_name: s.streetName, rating: s.rating },
      })),
  };
}

// (Re)creates the segment source/layer and pushes the current data into it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function syncSegments(map: any, segs: ExploreSegment[]) {
  const data = segmentCollection(segs);
  try {
    if (!map.getSource('sc-segs')) {
      map.addSource('sc-segs', { type: 'geojson', data });
      map.addLayer(
        {
          id: 'sc-segs', type: 'line', source: 'sc-segs',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-width': 5,
            'line-opacity': 0.85,
            'line-color': ['match', ['get', 'rating'],
              'full',    '#22c55e',
              'partial', '#f59e0b',
              'none',    '#ef4444',
              '#9ca3af',
            ],
          },
        },
        'clusters', // render below point markers
      );
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map.getSource('sc-segs') as any).setData(data);
    }
  } catch { /* style mid-swap — style.load will re-add */ }
}

// (Re)creates the route sources/layers and pushes the current display into them.
// Safe to call repeatedly and after style swaps.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function syncRoute(map: any, route: RouteDisplay | null) {
  const lines = {
    type: 'FeatureCollection',
    features: (route?.lines ?? []).map((l) => ({
      type: 'Feature',
      properties: { color: l.color, width: l.width, opacity: l.opacity, dash: l.dash ? 1 : 0, sort: l.sort ?? 0 },
      geometry: { type: 'LineString', coordinates: l.coords },
    })),
  };
  const markers = {
    type: 'FeatureCollection',
    features: (route?.markers ?? []).map((m) => ({
      type: 'Feature',
      properties: { kind: m.kind, label: m.label ?? '' },
      geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
    })),
  };
  try {
    if (!map.getSource('sc-route')) {
      map.addSource('sc-route', { type: 'geojson', data: lines });
      map.addSource('sc-route-pts', { type: 'geojson', data: markers });
      // Solid legs (transit + selected walk core).
      map.addLayer({
        id: 'sc-route-solid', type: 'line', source: 'sc-route',
        filter: ['!=', ['get', 'dash'], 1],
        layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['get', 'sort'] },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'] },
      });
      // Dashed legs (walking).
      map.addLayer({
        id: 'sc-route-dash', type: 'line', source: 'sc-route',
        filter: ['==', ['get', 'dash'], 1],
        layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['get', 'sort'] },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'], 'line-dasharray': [0.8, 1.6] },
      });
      // Marker cues: start/end + board/alight stops.
      map.addLayer({
        id: 'sc-route-cue', type: 'circle', source: 'sc-route-pts',
        paint: {
          'circle-radius': ['match', ['get', 'kind'], 'end', 8, 'start', 7, 5.5],
          'circle-color': ['match', ['get', 'kind'], 'start', '#ffffff', 'alight', '#ffffff', '#1d4ed8'],
          'circle-stroke-color': ['match', ['get', 'kind'], 'start', '#1d4ed8', 'alight', '#1d4ed8', '#ffffff'],
          'circle-stroke-width': 2.5,
        },
      });
      map.addLayer({
        id: 'sc-route-cue-label', type: 'symbol', source: 'sc-route-pts',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 11.5,
          'text-anchor': 'top',
          'text-offset': [0, 0.9],
          'text-optional': true,
          'text-max-width': 12,
        },
        paint: { 'text-color': '#1d4ed8', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
      });
    } else {
      map.getSource('sc-route').setData(lines);
      map.getSource('sc-route-pts').setData(markers);
    }
  } catch { /* style mid-swap — style.load will re-add */ }
}

/**
 * Immersive full-viewport map. Points live in a clustered GeoJSON source: dense
 * areas collapse into count bubbles that split apart as you zoom in, and every
 * point is a category-coloured teardrop pin (label appears when zoomed in). This
 * shows far more places at once and stays smooth (MapLibre renders them, not the DOM).
 */
export function ExploreMap({
  points,
  problems = [],
  segments = [],
  center,
  onSelect,
  onSelectProblem,
  onSelectSegment,
  onMoveEnd,
  focus,
  pickMode = false,
  onMapClick,
  route,
  marker,
  onMarkerMove,
}: {
  points: ExploreMarker[];
  problems?: ExploreProblem[];
  segments?: ExploreSegment[];
  center: [number, number];
  onSelect: (id: string) => void;
  onSelectProblem?: (id: string) => void;
  onSelectSegment?: (id: string) => void;
  onMoveEnd?: (b: Bbox) => void;
  focus?: { lng: number; lat: number; nonce: number; zoom?: number; bounds?: [[number, number], [number, number]] } | null;
  pickMode?: boolean;
  onMapClick?: (lng: number, lat: number) => void;
  route?: RouteDisplay | null; // styled route lines + marker cues
  marker?: { lng: number; lat: number } | null; // user-dropped pin
  onMarkerMove?: (lng: number, lat: number) => void; // drag to reposition
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const problemMarkersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dropMarkerRef = useRef<any>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const pointsRef = useRef<ExploreMarker[]>(points);
  const segmentsRef = useRef<ExploreSegment[]>(segments);
  const onSelectRef = useRef(onSelect);
  const onSelectProblemRef = useRef(onSelectProblem);
  const onSelectSegmentRef = useRef(onSelectSegment);
  const onMoveEndRef = useRef(onMoveEnd);
  const pickModeRef = useRef(pickMode);
  const onMapClickRef = useRef(onMapClick);
  const routeRef = useRef<RouteDisplay | null>(route ?? null);
  const onMarkerMoveRef = useRef(onMarkerMove);
  pointsRef.current = points;
  segmentsRef.current = segments;
  onSelectRef.current = onSelect;
  onSelectProblemRef.current = onSelectProblem;
  onSelectSegmentRef.current = onSelectSegment;
  onMoveEndRef.current = onMoveEnd;
  pickModeRef.current = pickMode;
  onMapClickRef.current = onMapClick;
  routeRef.current = route ?? null;
  onMarkerMoveRef.current = onMarkerMove;

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const dark = () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: basemapStyle(dark()) as never,
        center,
        zoom: 13,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      const geolocate = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showAccuracyCircle: false, // desktop geolocation is IP-based (~100 km); keep just the dot
        fitBoundsOptions: { maxZoom: 15 },
      });
      map.addControl(geolocate, 'bottom-right');
      let centredOnUser = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      geolocate.on('geolocate', (e: any) => {
        if (centredOnUser) return;
        centredOnUser = true;
        map.jumpTo({ center: [e.coords.longitude, e.coords.latitude], zoom: Math.max(map.getZoom(), 15) });
      });

      // (Re)register pin images + the clustered source & layers. Runs on first load
      // and again after every style swap (theme toggle wipes style-owned state).
      async function addPointLayers() {
        const kinds = Object.keys(PLACE_META) as PlaceKind[];
        const levels = Object.keys(LEVEL_HEX) as AccessLevel[];
        // One pin image per (kind × level): teardrop tinted by level, glyph by kind.
        await Promise.all(
          kinds.flatMap((k) =>
            levels.map(
              (lvl) =>
                new Promise<void>((resolve) => {
                  const id = `${k}::${lvl}`;
                  if (map.hasImage(id)) return resolve();
                  const img = new Image();
                  img.onload = () => { if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 }); resolve(); };
                  img.onerror = () => resolve();
                  img.src = pinDataUrl(k, LEVEL_HEX[lvl]);
                }),
            ),
          ),
        );
        if (!map.getSource('pts')) {
          map.addSource('pts', {
            type: 'geojson',
            data: featureCollection(pointsRef.current),
            cluster: true,
            clusterRadius: 55,
            clusterMaxZoom: 15,
          });
        }
        if (!map.getLayer('clusters')) {
          map.addLayer({
            id: 'clusters', type: 'circle', source: 'pts', filter: ['has', 'point_count'],
            paint: {
              'circle-color': ['step', ['get', 'point_count'], '#0d5b66', 20, '#2563eb', 75, '#7c3aed'],
              'circle-radius': ['step', ['get', 'point_count'], 18, 20, 24, 75, 32],
              'circle-stroke-width': 2.5, 'circle-stroke-color': '#fff', 'circle-opacity': 0.95,
            },
          });
        }
        if (!map.getLayer('cluster-count')) {
          map.addLayer({
            id: 'cluster-count', type: 'symbol', source: 'pts', filter: ['has', 'point_count'],
            layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 14 },
            paint: { 'text-color': '#fff' },
          });
        }
        if (!map.getLayer('pt')) {
          map.addLayer({
            id: 'pt', type: 'symbol', source: 'pts', filter: ['!', ['has', 'point_count']],
            layout: {
              'icon-image': ['get', 'icon'],
              'icon-size': 1.3,
              'icon-anchor': 'bottom',
              'icon-allow-overlap': true,
              'text-field': ['step', ['zoom'], '', 15, ['get', 'name']],
              'text-font': ['Noto Sans Regular'],
              'text-size': 11,
              'text-anchor': 'top',
              'text-offset': [0, 0.3],
              'text-optional': true,
              'text-max-width': 9,
            },
            paint: {
              'text-color': dark() ? '#e5e7eb' : '#1f2937',
              'text-halo-color': dark() ? '#0b0f14' : '#ffffff',
              'text-halo-width': 1.4,
            },
          });
        }
      }

      const emit = () => {
        const b = map.getBounds();
        onMoveEndRef.current?.({ minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth(), zoom: map.getZoom() });
      };

      map.on('load', async () => {
        await addPointLayers();
        syncSegments(map, segmentsRef.current);
        emit();
        try { geolocate.trigger(); } catch { /* denied — stay at center */ }
      });
      map.on('moveend', emit);

      // Re-add style-owned layers after a theme swap.
      map.on('style.load', () => {
        void addPointLayers().then(() => {
          syncRoute(map, routeRef.current);
          syncSegments(map, segmentsRef.current);
        });
      });

      // Cluster click → zoom into it (maplibre-gl v5 returns a Promise).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('click', 'clusters', async (e: any) => {
        const f = e.features?.[0];
        if (!f) return;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const src = map.getSource('pts') as any;
          const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id);
          map.easeTo({ center: f.geometry.coordinates, zoom });
        } catch { /* ignore */ }
      });
      // Point click → open detail.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('click', 'pt', (e: any) => {
        const f = e.features?.[0];
        if (f) onSelectRef.current(f.properties.id);
      });
      // Segment click → open segment panel.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('click', 'sc-segs', (e: any) => {
        const f = e.features?.[0];
        if (f) onSelectSegmentRef.current?.(f.properties.id);
      });
      // Empty-map click → drop/route pick (skip when a feature was hit).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('click', (e: any) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ['clusters', 'pt', 'sc-segs'] });
        if (hits.length) return;
        onMapClickRef.current?.(e.lngLat.lng, e.lngLat.lat);
      });
      for (const layer of ['clusters', 'pt', 'sc-segs']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = pickModeRef.current ? 'crosshair' : ''; });
      }

      observerRef.current = new MutationObserver(() => {
        try { map.setStyle(basemapStyle(dark()) as never); } catch { /* ignore */ }
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

  // Push new point data into the clustered source.
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource?.('pts');
    if (src) src.setData(featureCollection(points));
  }, [points]);

  // Push new segment data into the segment source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return;
    syncSegments(map, segments);
  }, [segments]);

  // Sync the problems layer (distinct warning markers — few, kept as DOM).
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
    return () => { cancelled = true; };
  }, [problems]);

  // Draw / update the route display, and shrink/dim POI pins while a route is
  // shown so the path stays readable.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const active = !!route && route.lines.length > 0;
    const apply = () => {
      syncRoute(map, route ?? null);
      try {
        if (map.getLayer('pt')) {
          map.setLayoutProperty('pt', 'icon-size', active ? 0.85 : 1.3);
          map.setPaintProperty('pt', 'icon-opacity', active ? 0.45 : 1);
          map.setPaintProperty('pt', 'text-opacity', active ? 0.3 : 1);
        }
        if (map.getLayer('clusters')) map.setPaintProperty('clusters', 'circle-opacity', active ? 0.3 : 0.95);
        if (map.getLayer('cluster-count')) map.setPaintProperty('cluster-count', 'text-opacity', active ? 0.4 : 1);
      } catch { /* style mid-swap */ }
    };
    if (map.isStyleLoaded()) apply(); else map.once('load', apply);
  }, [route]);

  // User-dropped marker: create/move/remove a draggable pin.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      const map = mapRef.current;
      if (cancelled || !map) return;
      if (!marker) {
        dropMarkerRef.current?.remove();
        dropMarkerRef.current = null;
        return;
      }
      if (!dropMarkerRef.current) {
        const el = document.createElement('div');
        el.setAttribute('aria-label', 'Ваша мітка');
        el.style.cssText = 'cursor:grab;line-height:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));';
        // A proper downward teardrop pin (distinct rose colour, white centre dot).
        el.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 40 52">' +
          '<path d="M20 50C12 38 3 30 3 18A17 17 0 1 1 37 18C37 30 28 38 20 50Z" fill="#e11d48" stroke="#fff" stroke-width="3"/>' +
          '<circle cx="20" cy="18" r="6.5" fill="#fff"/>' +
          '</svg>';
        const m = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom' })
          .setLngLat([marker.lng, marker.lat])
          .addTo(map);
        m.on('dragend', () => { const p = m.getLngLat(); onMarkerMoveRef.current?.(p.lng, p.lat); });
        dropMarkerRef.current = m;
      } else {
        dropMarkerRef.current.setLngLat([marker.lng, marker.lat]);
      }
    })();
    return () => { cancelled = true; };
  }, [marker]);

  // Crosshair cursor while picking a location.
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas?.() as HTMLCanvasElement | undefined;
    if (canvas) canvas.style.cursor = pickMode ? 'crosshair' : '';
  }, [pickMode]);

  // Fly to a chosen search result / focus (explicit zoom for city switches).
  // When `bounds` is present (city switch with loaded segments) we frame the
  // accessibility data instead of a fixed civic-centre zoom — OSM sidewalks are
  // scattered across the metro, so a tight centre view often lands on empty
  // space even though the city is well seeded.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if (focus.bounds) {
      map.fitBounds(focus.bounds, { padding: 48, maxZoom: 13, duration: 800 });
    } else {
      map.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom ?? Math.max(map.getZoom(), 16), duration: 800 });
    }
  }, [focus]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
