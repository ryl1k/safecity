import type { Profile } from '@safecity/shared';
import { api } from './api';

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
  await api.post(`/points/${pointId}/reviews`, { profile, stars, text, photos });
}

export interface ReviewStat {
  avg: number;
  count: number;
}

/** Average stars + count per point (aggregated by the API in SQL). */
export async function reviewStats(): Promise<Record<string, ReviewStat>> {
  const rows = await api.get<{ point_id: string; avg: number; count: number }[]>('/reviews/stats');
  const out: Record<string, ReviewStat> = {};
  for (const r of rows) out[r.point_id] = { avg: r.avg, count: r.count };
  return out;
}

export async function reviewsFor(pointId: string): Promise<ReviewRow[]> {
  const rows = await api.get<
    { id: string; profile: Profile; stars: number; text: string | null; photos: string[] | null; created_at: string }[]
  >(`/points/${pointId}/reviews`);
  return rows.map((r) => ({
    id: r.id,
    profile: r.profile,
    stars: r.stars,
    text: r.text,
    photos: r.photos ?? [],
    createdAt: r.created_at,
  }));
}
