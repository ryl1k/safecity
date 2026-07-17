import { api, qs } from './api';

export interface StreetSegment {
  id: string;
  streetName: string;
  sidewalkWidthM: number | null;
  surfaceType: string | null;
  inclinePercent: number | null;
  hasTactilePaving: boolean | null;
  isStepFree: boolean | null;
  hasCurbCuts: boolean | null;
  hasRamp: boolean | null;
  lit: boolean | null;
  isObstacleFree: boolean | null;
  smoothness: string | null;
  verifyStatus: string;
  rating: 'full' | 'partial' | 'none' | 'unknown';
  // Per-field provenance: field name → source ('osm' | 'dem' | 'gov' | 'user').
  fieldSources: Record<string, string>;
  geojson: string; // GeoJSON LineString geometry from ST_AsGeoJSON
}

export interface NewSegment {
  streetName: string;
  coords: [number, number][];
  photos: string[];
  sidewalkWidthM?: number | null;
  surfaceType?: string;
  inclinePercent?: number | null;
  hasTactilePaving?: boolean | null;
  isStepFree?: boolean | null;
  hasCurbCuts?: boolean | null;
  hasRamp?: boolean | null;
  lit?: boolean | null;
}

export async function submitSegment(seg: NewSegment): Promise<string> {
  const res = await api.post<{ id: string }>('/segments', seg);
  return res.id;
}

export async function segmentsInBbox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): Promise<StreetSegment[]> {
  return api.get<StreetSegment[]>(
    `/segments/bbox${qs({ min_lng: minLng, min_lat: minLat, max_lng: maxLng, max_lat: maxLat })}`,
  );
}
