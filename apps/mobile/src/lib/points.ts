// Point reads (RN port of apps/web/src/lib/points.ts). Uses the Go API when
// configured, else Supabase RPCs. Returns @safecity/shared PointSummary.
import type { PointSummary } from '@safecity/shared';
import { api, apiEnabled, qs } from './api';
import { supabase } from './supabase';

interface RpcRow {
  id: string;
  name: string;
  category: PointSummary['category'];
  address: string | null;
  description?: string | null;
  photos?: string[] | null;
  lng: number;
  lat: number;
  verify_status: PointSummary['verifyStatus'];
  distance_m?: number;
  features: PointSummary['features'];
}

function mapRow(r: RpcRow): PointSummary {
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
    distanceM: r.distance_m ?? undefined,
    features: r.features ?? {},
  };
}

/** Points within radius (m) of a location, nearest first. */
export async function pointsNear(lng: number, lat: number, radiusM = 1500): Promise<PointSummary[]> {
  if (apiEnabled) {
    return api.get<PointSummary[]>(`/points/near${qs({ lng, lat, radius: radiusM })}`);
  }
  const { data, error } = await supabase.rpc('points_near', { lng, lat, radius_m: radiusM });
  if (error) throw error;
  return ((data ?? []) as RpcRow[]).map(mapRow);
}

/** Points whose geometry falls inside a map bounding box. */
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
  return ((data ?? []) as RpcRow[]).map(mapRow);
}
