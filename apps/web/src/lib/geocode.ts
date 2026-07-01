// Place/address search. Prefers the Go API (/geocode, server-side Nominatim with
// caching); falls back to Nominatim-direct when the API isn't configured.
import { api, apiEnabled, qs } from './api';

export interface GeoPlace {
  id: string;
  label: string;
  lng: number;
  lat: number;
}

// Rough Ukraine viewbox to bias relevance without hard-locking results.
const VIEWBOX = '22.0,52.5,40.5,44.0'; // minLng,maxLat,maxLng,minLat

interface NominatimRow {
  place_id: number;
  display_name: string;
  lon: string;
  lat: string;
}

/** Reverse-geocode coordinates to a human address. Returns null if none found.
 *  Prefers the Go API (/geocode/reverse); falls back to Nominatim-direct. */
export async function reverseGeocode(lng: number, lat: number, signal?: AbortSignal): Promise<string | null> {
  try {
    if (apiEnabled) {
      const p = await api.get<GeoPlace>(`/geocode/reverse${qs({ lng, lat })}`, { signal });
      return p?.label ?? null;
    }
    const url =
      'https://nominatim.openstreetmap.org/reverse' +
      `?format=jsonv2&lon=${lng}&lat=${lat}&accept-language=uk&zoom=18`;
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const row = (await res.json()) as { display_name?: string };
    return row.display_name ?? null;
  } catch {
    return null; // best-effort — callers fall back to coords
  }
}

/** Geocode a free-text place/address query. Returns up to `limit` matches. */
export async function geocodePlaces(query: string, limit = 5, signal?: AbortSignal): Promise<GeoPlace[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  if (apiEnabled) {
    return api.get<GeoPlace[]>(`/geocode${qs({ q, limit })}`, { signal });
  }
  const url =
    'https://nominatim.openstreetmap.org/search' +
    `?format=jsonv2&q=${encodeURIComponent(q)}` +
    `&limit=${limit}&accept-language=uk&countrycodes=ua&viewbox=${VIEWBOX}&bounded=0`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const rows = (await res.json()) as NominatimRow[];
  return rows.map((r) => ({
    id: `osm-${r.place_id}`,
    label: r.display_name,
    lng: Number(r.lon),
    lat: Number(r.lat),
  }));
}
