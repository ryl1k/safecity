import type { PointSummary } from '@safecity/shared';
import { supabase } from './supabase';

interface NearRow {
  id: string;
  name: string;
  category: PointSummary['category'];
  address: string | null;
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
  const { data, error } = await supabase.rpc('points_near', { lng, lat, radius_m: radiusM });
  if (error) throw error;
  return ((data ?? []) as NearRow[]).map(mapRow);
}

/** A single point by id (coords + feature values), or null. */
export async function pointById(id: string): Promise<PointSummary | null> {
  const { data, error } = await supabase.rpc('point_detail', { p_id: id });
  if (error) throw error;
  const r = ((data ?? []) as NearRow[])[0];
  if (!r) return null;
  return mapRow({ ...r, distance_m: 0 });
}
