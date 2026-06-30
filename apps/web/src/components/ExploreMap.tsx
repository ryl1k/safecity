'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { Category } from '@safecity/shared';
import { categoryIcon } from '@/lib/filters';

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
}

const LABEL_ZOOM = 15.5; // show name labels once zoomed in this far

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
 * Immersive full-viewport map. Category-icon pins with an accessibility ring;
 * name labels appear once zoomed in. Reports the visible bbox on pan/zoom.
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const problemMarkersRef = useRef<any[]>([]);
  const labelsRef = useRef<HTMLElement[]>([]);
  const observerRef = useRef<MutationObserver | null>(null);
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
        onMoveEndRef.current?.({ minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth() });
      };
      const updateLabels = () => {
        const show = map.getZoom() >= LABEL_ZOOM;
        for (const l of labelsRef.current) l.style.display = show ? 'block' : 'none';
      };
      map.on('load', emit);
      map.on('moveend', emit);
      map.on('zoom', updateLabels);

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

  // Sync markers when points change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      const map = mapRef.current;
      if (cancelled || !map) return;
      markersRef.current.forEach((m) => m.remove());
      labelsRef.current = [];
      const labelsVisible = map.getZoom() >= LABEL_ZOOM;
      markersRef.current = points.map((p) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;';

        const pin = document.createElement('button');
        pin.className = 'sc-foc';
        pin.type = 'button';
        pin.setAttribute('aria-label', p.name);
        pin.style.cssText =
          'width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:15px;line-height:1;' +
          `background:var(--sc-surface);box-shadow:var(--sc-shadow-2);cursor:pointer;` +
          `border:2px solid ${p.accessible ? 'var(--sc-ok)' : 'var(--sc-border-strong)'};`;
        pin.textContent = categoryIcon[p.category];
        pin.addEventListener('click', () => onSelectRef.current(p.id));

        const label = document.createElement('div');
        label.textContent = p.name;
        label.style.cssText =
          `display:${labelsVisible ? 'block' : 'none'};max-width:140px;margin-top:2px;font-size:11px;font-weight:700;` +
          'color:var(--sc-text);background:var(--sc-surface);border:var(--sc-bw) solid var(--sc-border);' +
          'border-radius:6px;padding:1px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        labelsRef.current.push(label);

        wrap.appendChild(pin);
        wrap.appendChild(label);
        return new maplibregl.Marker({ element: wrap }).setLngLat([p.lng, p.lat]).addTo(map);
      });
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

  // Fly to a chosen search result.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(map.getZoom(), 16), duration: 800 });
  }, [focus]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
