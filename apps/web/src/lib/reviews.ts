import type { Profile } from '@safecity/shared';
import { api, apiEnabled } from './api';
import { supabase } from './supabase';

export interface ReviewRow {
  id: string;
  profile: Profile;
  stars: number;
  text: string | null;
  photos: string[];
  createdAt: string;
}

export async function addReview(
  pointId: string,
  profile: Profile,
  stars: number,
  text: string,
  photos: string[] = [],
): Promise<void> {
  if (apiEnabled) {
    await api.post(`/points/${pointId}/reviews`, { profile, stars, text, photos });
    return;
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not-authenticated');
  const { error } = await supabase.from('reviews').upsert(
    { point_id: pointId, user_id: auth.user.id, profile, stars, text: text || null, photos },
    { onConflict: 'point_id,user_id,profile' },
  );
  if (error) throw error;
}

export interface ReviewStat {
  avg: number;
  count: number;
}

/** Average stars + count per point that has reviews. Fetches all reviews (the
 *  table is small — user-generated only) and aggregates client-side. */
export async function reviewStats(): Promise<Record<string, ReviewStat>> {
  const { data, error } = await supabase.from('reviews').select('point_id, stars');
  if (error || !data) return {};
  const acc: Record<string, { sum: number; count: number }> = {};
  for (const r of data as { point_id: string; stars: number }[]) {
    const a = (acc[r.point_id] ??= { sum: 0, count: 0 });
    a.sum += r.stars;
    a.count += 1;
  }
  const out: Record<string, ReviewStat> = {};
  for (const [id, a] of Object.entries(acc)) out[id] = { avg: a.sum / a.count, count: a.count };
  return out;
}

export async function reviewsFor(pointId: string): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, profile, stars, text, photos, created_at')
    .eq('point_id', pointId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    profile: r.profile,
    stars: r.stars,
    text: r.text,
    photos: r.photos ?? [],
    createdAt: r.created_at,
  }));
}
