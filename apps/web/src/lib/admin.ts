import type { Category, ProblemStatus, Profile, VerifyStatus } from '@safecity/shared';
import { supabase } from './supabase';

export type UserRole = 'user' | 'trusted' | 'moderator';

export async function getMyRole(): Promise<{ userId: string; role: string } | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  return { userId: data.user.id, role: prof?.role ?? 'user' };
}

export interface AdminPoint {
  id: string;
  name: string;
  category: Category;
  address: string | null;
  verifyStatus: VerifyStatus;
}

export async function unverifiedPoints(): Promise<AdminPoint[]> {
  const { data, error } = await supabase
    .from('points')
    .select('id, name, category, address, verify_status')
    .eq('verify_status', 'unverified')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, category: r.category, address: r.address, verifyStatus: r.verify_status }));
}

export async function verifyPoint(id: string): Promise<void> {
  const { error } = await supabase.from('points').update({ verify_status: 'verified' }).eq('id', id);
  if (error) throw error;
}

export async function setPointVerify(id: string, status: VerifyStatus): Promise<void> {
  const { error } = await supabase.from('points').update({ verify_status: status }).eq('id', id);
  if (error) throw error;
}

export async function deletePoint(id: string): Promise<void> {
  const { error } = await supabase.from('points').delete().eq('id', id);
  if (error) throw error;
}

export interface AdminProblem {
  id: string;
  title: string;
  status: ProblemStatus;
  confirmations: number;
}

export async function openProblems(): Promise<AdminProblem[]> {
  const { data, error } = await supabase
    .from('problems')
    .select('id, title, status, confirmations')
    .neq('status', 'resolved')
    .order('confirmations', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, status: r.status, confirmations: r.confirmations }));
}

export async function resolveProblem(id: string): Promise<void> {
  const { error } = await supabase
    .from('problems')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteProblem(id: string): Promise<void> {
  const { error } = await supabase.from('problems').delete().eq('id', id);
  if (error) throw error;
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
  const { data, error } = await supabase
    .from('reviews')
    .select('id, stars, text, profile, created_at, points(name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    stars: r.stars,
    text: r.text,
    profile: r.profile,
    pointName: r.points?.name ?? null,
    createdAt: r.created_at,
  }));
}

export async function deleteReview(id: string): Promise<void> {
  const { error } = await supabase.from('reviews').delete().eq('id', id);
  if (error) throw error;
}

// ── User / role management ───────────────────────────────────────────────────
export interface AdminUser {
  id: string;
  displayName: string | null;
  role: UserRole;
}

export async function listUsers(limit = 100): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, displayName: r.display_name, role: r.role }));
}

export async function setUserRole(id: string, role: UserRole): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  if (error) throw error;
}
