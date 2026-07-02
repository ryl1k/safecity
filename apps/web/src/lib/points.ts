import type { PointSummary } from '@safecity/shared';
import { api, ApiError, qs } from './api';

/** Points within radius (m) of a location, nearest first. */
export async function pointsNear(
  lng: number,
  lat: number,
  radiusM = 1500,
): Promise<PointSummary[]> {
  return api.get<PointSummary[]>(`/points/near${qs({ lng, lat, radius: radiusM })}`);
}

/** All points whose geometry falls inside a map bounding box (for the full-screen map). */
export async function pointsInBbox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): Promise<PointSummary[]> {
  return api.get<PointSummary[]>(
    `/points/bbox${qs({ min_lng: minLng, min_lat: minLat, max_lng: maxLng, max_lat: maxLat })}`,
  );
}

export interface PointHit {
  id: string;
  name: string;
  category: PointSummary['category'];
  address: string | null;
}

/** Name/address search across all points (for the full-screen map search box). */
export async function searchPointsByName(query: string, limit = 6): Promise<PointHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  return api.get<PointHit[]>(`/points/search${qs({ q, limit })}`);
}

/** A single point by id (coords + feature values), or null. */
export async function pointById(id: string): Promise<PointSummary | null> {
  try {
    return await api.get<PointSummary>(`/points/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
