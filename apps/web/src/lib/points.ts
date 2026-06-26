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

/** A single point by id (with its feature values), or null. */
export async function pointById(id: string): Promise<PointSummary | null> {
  const { data, error } = await supabase
    .from('points')
    .select('id, name, category, address, verify_status, point_feature_values(feature_key, value)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const features: PointSummary['features'] = {};
  for (const fv of (data as any).point_feature_values ?? []) features[fv.feature_key] = fv.value;
  return {
    id: data.id,
    name: data.name,
    category: data.category,
    address: data.address,
    lng: 0,
    lat: 0,
    verifyStatus: data.verify_status,
    features,
  };
}
