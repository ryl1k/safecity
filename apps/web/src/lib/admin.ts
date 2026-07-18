// Moderation — thin client over the Go API's /admin surface (moderator-gated
// server-side by role middleware + RLS).
import type { Category, ProblemStatus, Profile, VerifyStatus } from '@safecity/shared';
import { api, qs } from './api';
import { supabase } from './supabase';

export type UserRole = 'user' | 'trusted' | 'moderator';

export async function getMyRole(): Promise<{ userId: string; role: string } | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  try {
    const me = await api.get<{ user_id: string; role?: string }>('/me', { auth: true });
    return { userId: me.user_id, role: me.role ?? 'user' };
  } catch {
    return null;
  }
}

export interface AdminPoint {
  id: string;
  name: string;
  category: Category;
  address: string | null;
  verifyStatus: VerifyStatus;
}

export async function unverifiedPoints(): Promise<AdminPoint[]> {
  return api.get<AdminPoint[]>('/admin/points/unverified', { auth: true });
}

export async function verifyPoint(id: string): Promise<void> {
  await setPointVerify(id, 'verified');
}

export async function setPointVerify(id: string, status: VerifyStatus): Promise<void> {
  await api.post(`/admin/points/${id}/verify`, { status });
}

export async function deletePoint(id: string): Promise<void> {
  await api.del(`/admin/points/${id}`);
}

export interface AdminProblem {
  id: string;
  title: string;
  status: ProblemStatus;
  confirmations: number;
}

export async function openProblems(): Promise<AdminProblem[]> {
  return api.get<AdminProblem[]>('/admin/problems', { auth: true });
}

export async function resolveProblem(id: string): Promise<void> {
  await api.post(`/admin/problems/${id}/resolve`);
}

export async function deleteProblem(id: string): Promise<void> {
  await api.del(`/admin/problems/${id}`);
}

// ── Review moderation ────────────────────────────────────────────────────────
export interface AdminReview {
  id: string;
  stars: number;
  text: string | null;
  profile: Profile;
  pointName: string | null;
  createdAt: string;
}

export async function recentReviews(limit = 50): Promise<AdminReview[]> {
  const rows = await api.get<
    { id: string; stars: number; text: string | null; profile: Profile; point_name: string | null; created_at: string }[]
  >(`/admin/reviews${qs({ limit })}`, { auth: true });
  return rows.map((r) => ({
    id: r.id,
    stars: r.stars,
    text: r.text,
    profile: r.profile,
    pointName: r.point_name,
    createdAt: r.created_at,
  }));
}

export async function deleteReview(id: string): Promise<void> {
  await api.del(`/admin/reviews/${id}`);
}

// ── Segment moderation ───────────────────────────────────────────────────────
export interface AdminSegment {
  id: string;
  street_name: string | null;
  surface_type: string | null;
  rating: string;
  created_at: string;
}

export async function listUserSegments(limit = 200): Promise<AdminSegment[]> {
  return api.get<AdminSegment[]>(`/admin/segments${qs({ limit })}`, { auth: true });
}

export async function deleteSegment(id: string): Promise<void> {
  await api.del(`/admin/segments/${id}`);
}

// ── User / role management ───────────────────────────────────────────────────
export interface AdminUser {
  id: string;
  displayName: string | null;
  role: UserRole;
}

export async function listUsers(limit = 100): Promise<AdminUser[]> {
  const rows = await api.get<{ id: string; display_name: string | null; role: UserRole }[]>(
    `/admin/users${qs({ limit })}`,
    { auth: true },
  );
  return rows.map((r) => ({ id: r.id, displayName: r.display_name, role: r.role }));
}

export async function setUserRole(id: string, role: UserRole): Promise<void> {
  await api.post(`/admin/users/${id}/role`, { role });
}
