import type { ProblemStatus } from '@safecity/shared';
import { supabase } from './supabase';

export interface ProblemRow {
  id: string;
  title: string;
  description: string | null;
  status: ProblemStatus;
  severity: number;
  confirmations: number;
  pointName: string | null;
  createdAt: string;
}

export interface PetitionRow {
  id: string;
  scope: 'internal' | 'official';
  title: string;
  body: string | null;
  officialUrl: string | null;
  internalSignatures: number;
  officialSignatureCount: number | null;
  status: string;
}

function mapProblem(r: any): ProblemRow {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    severity: r.severity,
    confirmations: r.confirmations,
    pointName: r.points?.name ?? null,
    createdAt: r.created_at,
  };
}

export async function listProblems(): Promise<ProblemRow[]> {
  const { data, error } = await supabase
    .from('problems')
    .select('id, title, description, status, severity, confirmations, created_at, points(name)')
    .order('confirmations', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapProblem);
}

export async function problemById(
  id: string,
): Promise<{ problem: ProblemRow; petition: PetitionRow | null } | null> {
  const { data, error } = await supabase
    .from('problems')
    .select('id, title, description, status, severity, confirmations, created_at, points(name), petitions(*)')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const pet = (data as any).petitions?.[0];
  return {
    problem: mapProblem(data),
    petition: pet
      ? {
          id: pet.id,
          scope: pet.scope,
          title: pet.title,
          body: pet.body,
          officialUrl: pet.official_url,
          internalSignatures: pet.internal_signatures,
          officialSignatureCount: pet.official_signature_count,
          status: pet.status,
        }
      : null,
  };
}
