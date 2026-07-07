'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { loadCity } from '@/lib/cities';

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

/**
 * Click (or drag the pin) to choose a point's location.
 *
 * `onChange` fires ONLY on a genuine user action (map click, pin drag, or
 * "my location") — never on mount or when `value` is set from the outside.
 * That lets callers reverse-geocode a *user-picked* spot without clobbering an
 * already-loaded address, and lets an address autocomplete drive `value` (which
 * moves the pin here) without bouncing back into a reverse-geocode loop.
 */
export function LocationPicker({
  value,
  onChange,
}: {
  value: [number, number] | null;
  onChange: (lng: number, lat: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const mlRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Always-current mirror of `value`, readable from inside the once-only effect.
  const valueRef = useRef(value);
  valueRef.current = value;
  // Coords we last emitted/placed from inside — lets the value-sync effect
  // ignore its own echo and react only to *external* changes.
  const lastRef = useRef<[number, number] | null>(value);
  // Set once the map is ready; used by useMyLocation + the value-sync effect.
  const ensureMarkerRef = useRef<((lng: number, lat: number) => void) | null>(null);
  const userPickRef = useRef<((lng: number, lat: number) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      mlRef.current = maplibregl;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const dark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
      const c = loadCity();
      const start = valueRef.current ?? [c.lng, c.lat];
      const map = new maplibregl.Map({ container: containerRef.current, style: styleFor(dark) as any, center: start as [number, number], zoom: 14 });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      // Create or move the marker WITHOUT notifying — for programmatic placement.
      const ensureMarker = (lng: number, lat: number) => {
        if (!markerRef.current) {
          markerRef.current = new maplibregl.Marker({ color: '#0d5b66', draggable: true }).setLngLat([lng, lat]).addTo(map);
          markerRef.current.on('dragend', () => {
            const ll = markerRef.current.getLngLat();
            userPick(ll.lng, ll.lat);
          });
        } else {
          markerRef.current.setLngLat([lng, lat]);
        }
      };
      // A genuine user action — moves the marker AND notifies the caller.
      const userPick = (lng: number, lat: number) => {
        ensureMarker(lng, lat);
        lastRef.current = [lng, lat];
        onChangeRef.current(lng, lat);
      };
      ensureMarkerRef.current = ensureMarker;
      userPickRef.current = userPick;

      // Initial placement is silent (no onChange) so a loaded address survives.
      if (valueRef.current) {
        ensureMarker(valueRef.current[0], valueRef.current[1]);
        lastRef.current = valueRef.current;
      }
      map.on('click', (e: any) => userPick(e.lngLat.lng, e.lngLat.lat));
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      ensureMarkerRef.current = null;
      userPickRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to *external* value changes (e.g. an address-autocomplete pick):
  // move the pin and recenter, but skip our own echoed emissions.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value || !ensureMarkerRef.current) return;
    const le = lastRef.current;
    if (le && Math.abs(le[0] - value[0]) < 1e-9 && Math.abs(le[1] - value[1]) < 1e-9) return;
    ensureMarkerRef.current(value[0], value[1]);
    lastRef.current = value;
    map.flyTo({ center: value, zoom: Math.max(map.getZoom(), 15) });
  }, [value]);

  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const lng = pos.coords.longitude;
      const lat = pos.coords.latitude;
      const map = mapRef.current;
      if (!map || !userPickRef.current) return;
      map.flyTo({ center: [lng, lat], zoom: 15 });
      userPickRef.current(lng, lat);
    });
  }

  return (
    <div>
      <div ref={containerRef} style={{ height: 280, borderRadius: '0.8em', overflow: 'hidden', border: 'var(--sc-bw) solid var(--sc-border)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', marginTop: '0.5em', flexWrap: 'wrap' }}>
        <button type="button" className="sc-foc" onClick={useMyLocation} style={{ background: 'none', border: 'none', color: 'var(--sc-primary)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85em' }}>
          📍 Моє місцезнаходження
        </button>
        <span style={{ color: 'var(--sc-muted)', fontSize: '0.8em' }}>
          {value ? `Обрано: ${value[1].toFixed(4)}, ${value[0].toFixed(4)}` : 'Торкніться мапи, щоб позначити місце'}
        </span>
      </div>
    </div>
  );
}
