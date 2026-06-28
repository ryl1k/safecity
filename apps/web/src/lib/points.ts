import type { PointSummary } from '@safecity/shared';
import { api, ApiError, apiEnabled, qs } from './api';
import { supabase } from './supabase';

interface NearRow {
  id: string;
  name: string;
  category: PointSummary['category'];
  address: string | null;
  description?: string | null;
  photos?: string[] | null;
  lng: number;
  lat: number;
  verify_status: PointSummary['verifyStatus'];
  distance_m: number;
  features: Record<string, PointSummary['features'][string]>;
}

function mapRow(r: NearRow): PointSummary {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    address: r.address,
    description: r.description ?? null,
    photos: r.photos ?? [],
    lng: r.lng,
    lat: r.lat,
    verifyStatus: r.verify_status,
    distanceM: r.distance_m,
    features: r.features ?? {},
  };
}

/** Points within radius (m) of a location, nearest first. */
export async function pointsNear(
  lng: number,
  lat: number,
  radiusM = 1500,
): Promise<PointSummary[]> {
  if (apiEnabled) {
    return api.get<PointSummary[]>(`/points/near${qs({ lng, lat, radius: radiusM })}`);
  }
  const { data, error } = await supabase.rpc('points_near', { lng, lat, radius_m: radiusM });
  if (error) throw error;
  return ((data ?? []) as NearRow[]).map(mapRow);
}

interface BboxRow {
  id: string;
  name: string;
  category: PointSummary['category'];
  address: string | null;
  lng: number;
  lat: number;
  verify_status: PointSummary['verifyStatus'];
  features: Record<string, PointSummary['features'][string]>;
}

/** All points whose geometry falls inside a map bounding box (for the full-screen map). */
export async function pointsInBbox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): Promise<PointSummary[]> {
  if (apiEnabled) {
    return api.get<PointSummary[]>(
      `/points/bbox${qs({ min_lng: minLng, min_lat: minLat, max_lng: maxLng, max_lat: maxLat })}`,
    );
  }
  const { data, error } = await supabase.rpc('points_in_bbox', {
    min_lng: minLng,
    min_lat: minLat,
    max_lng: maxLng,
    max_lat: maxLat,
  });
  if (error) throw error;
  return ((data ?? []) as BboxRow[]).map((r) =>
    mapRow({ ...r, description: null, distance_m: 0 }),
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
  const pattern = `%${q}%`;
  const { data, error } = await supabase
    .from('points')
    .select('id, name, category, address')
    .or(`name.ilike.${pattern},address.ilike.${pattern}`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PointHit[];
}

/** A single point by id (coords + feature values), or null. */
export async function pointById(id: string): Promise<PointSummary | null> {
  if (apiEnabled) {
    try {
      return await api.get<PointSummary>(`/points/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }
  const { data, error } = await supabase.rpc('point_detail', { p_id: id });
  if (error) throw error;
  const r = ((data ?? []) as NearRow[])[0];
  if (!r) return null;
  return mapRow({ ...r, distance_m: 0 });
}
