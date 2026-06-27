// Place/address search via Nominatim (OpenStreetMap). Free, no key, matches our
// OSM data attribution. Biased toward the user's region but not city-locked.

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

/** Geocode a free-text place/address query. Returns up to `limit` matches. */
export async function geocodePlaces(query: string, limit = 5, signal?: AbortSignal): Promise<GeoPlace[]> {
  const q = query.trim();
  if (q.length < 3) return [];
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
