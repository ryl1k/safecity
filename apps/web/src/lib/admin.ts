import type { Category, ProblemStatus, VerifyStatus } from '@safecity/shared';
import { supabase } from './supabase';

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
