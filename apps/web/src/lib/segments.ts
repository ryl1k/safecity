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
  verifyStatus: string;
  rating: 'full' | 'partial' | 'none' | 'unknown';
  geojson: string; // GeoJSON LineString geometry from ST_AsGeoJSON
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
