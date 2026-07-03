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

/** Click (or drag the pin) to choose a point's location. */
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      mlRef.current = maplibregl;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const dark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
      const c = loadCity();
      const map = new maplibregl.Map({ container: containerRef.current, style: styleFor(dark) as any, center: value ?? [c.lng, c.lat], zoom: 14 });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      const place = (lng: number, lat: number) => {
        if (!markerRef.current) {
          markerRef.current = new maplibregl.Marker({ color: '#0d5b66', draggable: true }).setLngLat([lng, lat]).addTo(map);
          markerRef.current.on('dragend', () => {
            const ll = markerRef.current.getLngLat();
            onChangeRef.current(ll.lng, ll.lat);
          });
        } else {
          markerRef.current.setLngLat([lng, lat]);
        }
        onChangeRef.current(lng, lat);
      };

      if (value) place(value[0], value[1]);
      map.on('click', (e: any) => place(e.lngLat.lng, e.lngLat.lat));
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const lng = pos.coords.longitude;
      const lat = pos.coords.latitude;
      const map = mapRef.current;
      const ml = mlRef.current;
      if (!map || !ml) return;
      map.flyTo({ center: [lng, lat], zoom: 15 });
      if (markerRef.current) {
        markerRef.current.setLngLat([lng, lat]);
      } else {
        markerRef.current = new ml.Marker({ color: '#0d5b66', draggable: true }).setLngLat([lng, lat]).addTo(map);
        markerRef.current.on('dragend', () => {
          const ll = markerRef.current.getLngLat();
          onChangeRef.current(ll.lng, ll.lat);
        });
      }
      onChangeRef.current(lng, lat);
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
