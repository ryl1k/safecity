import type { Profile } from '@safecity/shared';
import { supabase } from './supabase';

export interface ReviewRow {
  id: string;
  profile: Profile;
  stars: number;
  text: string | null;
  createdAt: string;
}

export async function reviewsFor(pointId: string): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, profile, stars, text, created_at')
    .eq('point_id', pointId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    profile: r.profile,
    stars: r.stars,
    text: r.text,
    createdAt: r.created_at,
  }));
}
