'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { loadCity } from '@/lib/cities';
import type { ElevSegment } from '@/lib/elevation';

function gradeColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 2) return '#16a34a';  // green  — flat
  if (abs < 5) return '#ca8a04';  // amber  — slight
  if (abs < 8) return '#ea580c';  // orange — moderate
  return '#dc2626';               // red    — steep
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildElevGeoJSON(segs: ElevSegment[]): any {
  return {
    type: 'FeatureCollection',
    features: segs.map((seg) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: seg.coords },
      properties: { color: gradeColor(seg.inclinePercent), dashed: 0 },
    })),
  };
}

function styleFor(dark: boolean) {
  const v = dark ? 'dark_all' : 'light_all';
  return {
    version: 8 as const,
    sources: {
      carto: {
        type: 'raster' as const,
        tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/${v}/{z}/{x}/{y}{r}.png`),
        tileSize: 256,
        attribution: '© OpenStreetMap © CARTO',
      },
    },
    layers: [{ id: 'carto', type: 'raster' as const, source: 'carto' }],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildLineGeoJSON(coords: [number, number][], dashed = false): any {
  if (coords.length < 2) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { dashed: dashed ? 1 : 0 },
    }],
  };
}

// Fetch pedestrian route between two points via OSRM (OSM foot profile).
async function osrmFoot(from: [number, number], to: [number, number]): Promise<[number, number][] | null> {
  const url =
    `https://routing.openstreetmap.de/routed-foot/route/v1/foot/` +
    `${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return null;
    return data.routes[0].geometry.coordinates as [number, number][];
  } catch {
    return null;
  }
}

// Route through all waypoints, stitching consecutive legs together.
async function routeWaypoints(waypoints: [number, number][]): Promise<[number, number][] | null> {
  if (waypoints.length < 2) return null;
  const legs = await Promise.all(
    waypoints.slice(0, -1).map((from, i) => osrmFoot(from, waypoints[i + 1] as [number, number])),
  );
  if (legs.some((l) => l === null)) return null;
  // Concatenate legs, removing the duplicate junction point between each pair.
  return legs.flatMap((leg, i) => (i === 0 ? leg! : leg!.slice(1)));
}

/** Click on the map to place waypoints; click a dot to remove it; drag to reposition.
 *  Once two or more waypoints exist the path snaps to OSM walking paths via OSRM.
 *  `onRouteChange` receives the full snapped geometry to use for submission. */
export function SegmentPicker({
  value,
  onChange,
  onRouteChange,
  elevSegments = [],
  initialCenter,
}: {
  value: [number, number][];
  onChange: (waypoints: [number, number][]) => void;
  /** Called with the full routed geometry (many coords) after OSRM resolves it. */
  onRouteChange?: (routedCoords: [number, number][]) => void;
  /** When provided, repaints the line as colour-coded grade segments. */
  elevSegments?: ElevSegment[];
  initialCenter?: [number, number] | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  const valueRef = useRef<[number, number][]>(value);
  const onChangeRef = useRef(onChange);
  const onRouteChangeRef = useRef(onRouteChange);
  const rebuildRef = useRef<((coords: [number, number][]) => void) | null>(null);
  const routeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot of waypoints at the moment a route fetch started — lets us discard
  // stale responses that arrived after the user moved a waypoint.
  const routingForRef = useRef<[number, number][] | null>(null);

  valueRef.current = value;
  onChangeRef.current = onChange;
  onRouteChangeRef.current = onRouteChange;

  const [routing, setRouting] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function syncLine(map: any, coords: [number, number][], dashed = false) {
    try {
      const src = map.getSource('seg-line');
      if (src) src.setData(buildLineGeoJSON(coords, dashed));
    } catch { /* style mid-swap */ }
  }

  // After each waypoint change: show a dashed straight preview immediately, then
  // fetch the snapped walking path and replace the line once it arrives.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function scheduleRoute(map: any, waypoints: [number, number][]) {
    if (routeTimerRef.current) clearTimeout(routeTimerRef.current);

    if (waypoints.length < 2) {
      setRouting(false);
      syncLine(map, waypoints);
      onRouteChangeRef.current?.([]);
      return;
    }

    syncLine(map, waypoints, true); // provisional dashed line
    setRouting(true);

    routeTimerRef.current = setTimeout(async () => {
      routingForRef.current = waypoints;
      const routed = await routeWaypoints(waypoints);

      // Discard if the user changed waypoints while we were waiting.
      if (routingForRef.current !== waypoints) return;

      setRouting(false);
      if (routed) {
        syncLine(map, routed);
        onRouteChangeRef.current?.(routed);
      } else {
        // OSRM unavailable or no path found — fall back to straight line.
        syncLine(map, waypoints);
        onRouteChangeRef.current?.(waypoints);
      }
    }, 350);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const dark =
        typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-theme') === 'dark';
      const c = loadCity();
      const center: [number, number] = initialCenter ?? [c.lng, c.lat];
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: styleFor(dark) as never,
        center,
        zoom: 15,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function rebuildMarkers(ml: any, m: any, coords: [number, number][]) {
        markersRef.current.forEach((mk) => mk.remove());
        markersRef.current = [];
        coords.forEach((coord, i) => addMarker(ml, m, coord, i));
      }

      rebuildRef.current = (coords) => rebuildMarkers(maplibregl, map, coords);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function addMarker(ml: any, m: any, coord: [number, number], index: number) {
        const el = document.createElement('div');
        el.title = 'Клацніть, щоб видалити точку';
        el.style.cssText =
          'width:18px;height:18px;border-radius:50%;background:#0d5b66;border:2.5px solid #fff;' +
          'box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer;transition:background 0.12s;';
        el.addEventListener('mouseenter', () => { el.style.background = '#b91c1c'; });
        el.addEventListener('mouseleave', () => { el.style.background = '#0d5b66'; });

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const next = valueRef.current.filter((_, idx) => idx !== index) as [number, number][];
          onChangeRef.current(next);
          scheduleRoute(m, next);
          rebuildMarkers(ml, m, next);
        });

        const marker = new ml.Marker({ element: el, draggable: true })
          .setLngLat(coord)
          .addTo(m);
        marker.on('dragstart', () => { el.style.cursor = 'grabbing'; });
        marker.on('dragend', () => {
          el.style.cursor = 'pointer';
          const ll = marker.getLngLat();
          const next = [...valueRef.current] as [number, number][];
          next[index] = [ll.lng, ll.lat];
          onChangeRef.current(next);
          scheduleRoute(m, next);
        });
        markersRef.current.push(marker);
      }

      map.on('load', () => {
        map.addSource('seg-line', { type: 'geojson', data: buildLineGeoJSON([]) });
        // Faint halo so the line is visible against both light and dark tiles.
        map.addLayer({
          id: 'seg-line-halo', type: 'line', source: 'seg-line',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#fff', 'line-width': 7, 'line-opacity': 0.5 },
        });
        map.addLayer({
          id: 'seg-line', type: 'line', source: 'seg-line',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ['coalesce', ['get', 'color'], '#0d5b66'],
            'line-width': 4,
            'line-opacity': 0.9,
            // While routing is pending the GeoJSON has dashed=1; use a dash pattern.
            'line-dasharray': [
              'case',
              ['==', ['get', 'dashed'], 1],
              ['literal', [4, 3]],
              ['literal', [1, 0]],
            ],
          },
        });

        rebuildMarkers(maplibregl, map, valueRef.current);

        if (initialCenter && valueRef.current.length === 0) {
          const first = initialCenter;
          const next: [number, number][] = [first];
          onChangeRef.current(next);
          addMarker(maplibregl, map, first, 0);
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('click', (e: any) => {
        const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const next = [...valueRef.current, coord] as [number, number][];
        onChangeRef.current(next);
        scheduleRoute(map, next);
        addMarker(maplibregl, map, coord, next.length - 1);
      });
    })();
    return () => {
      cancelled = true;
      rebuildRef.current = null;
      if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Repaint the line with grade colours whenever elevation segments arrive.
  // When elevSegments is empty (user moved a waypoint) scheduleRoute already
  // restored the provisional line, so we do nothing.
  useEffect(() => {
    if (elevSegments.length === 0) return;
    const map = mapRef.current;
    if (!map) return;
    try {
      const src = map.getSource('seg-line');
      if (src) src.setData(buildElevGeoJSON(elevSegments));
    } catch { /* style mid-swap */ }
  }, [elevSegments]);

  function undoLast() {
    if (value.length === 0) return;
    const next = value.slice(0, -1) as [number, number][];
    onChange(next);
    const map = mapRef.current;
    if (map) scheduleRoute(map, next);
    rebuildRef.current?.(next);
  }

  const hint =
    value.length === 0
      ? 'Натисніть на карті, щоб додати точки шляху'
      : routing
      ? 'Прокладаємо маршрут вулицями…'
      : value.length === 1
      ? '1 точка — додайте ще хоча б одну'
      : `${value.length} точок · маршрут прокладено`;

  return (
    <div>
      <div
        ref={containerRef}
        style={{ height: 300, borderRadius: '0.8em', overflow: 'hidden', border: 'var(--sc-bw) solid var(--sc-border)' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '1em', marginTop: '0.5em', flexWrap: 'wrap' }}>
        <span style={{ color: routing ? 'var(--sc-primary)' : 'var(--sc-muted)', fontSize: '0.82em', fontWeight: routing ? 700 : 400 }}>
          {hint}
        </span>
        {value.length > 0 && (
          <button
            type="button"
            onClick={undoLast}
            style={{ background: 'none', border: 'none', color: 'var(--sc-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82em' }}
          >
            ↩ Скасувати останню точку
          </button>
        )}
      </div>
      {value.length > 0 && (
        <p style={{ margin: '0.3em 0 0', color: 'var(--sc-muted)', fontSize: '0.78em' }}>
          Наведіть на точку та клацніть, щоб видалити. Перетягніть, щоб перемістити.
        </p>
      )}
    </div>
  );
}
