// Place/address search — thin client over the Go API (/geocode, server-side
// Nominatim with caching and label shaping).
import { api, qs } from './api';

export interface GeoPlace {
  id: string;
  label: string;
  lng: number;
  lat: number;
}

/** Reverse-geocode coordinates to a human address. Returns null if none found. */
export async function reverseGeocode(lng: number, lat: number, signal?: AbortSignal): Promise<string | null> {
  try {
    const p = await api.get<GeoPlace>(`/geocode/reverse${qs({ lng, lat })}`, { signal });
    return p?.label ?? null;
  } catch {
    return null; // best-effort — callers fall back to coords
  }
}

/** Geocode a free-text place/address query. Returns up to `limit` matches. */
export async function geocodePlaces(query: string, limit = 5, signal?: AbortSignal): Promise<GeoPlace[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  return api.get<GeoPlace[]>(`/geocode${qs({ q, limit })}`, { signal });
}
