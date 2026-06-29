// Civic loop (RN port of apps/web/src/lib/civic.ts). Reads with no Go endpoint
// (problems list/bbox/detail) stay Supabase-direct; writes use the Go API.
import type { ProblemStatus } from '@safecity/shared';
import { api, apiEnabled } from './api';
import { supabase } from './supabase';

export interface ProblemRow {
  id: string;
  title: string;
  description: string | null;
  status: ProblemStatus;
  severity: number;
  confirmations: number;
  photos: string[];
  pointName: string | null;
  createdAt: string;
}

export interface ProblemMarker {
  id: string;
  title: string;
  status: ProblemStatus;
  severity: number;
  confirmations: number;
  lng: number;
  lat: number;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProblem(r: any): ProblemRow {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    severity: r.severity,
    confirmations: r.confirmations,
    photos: r.photos ?? [],
    pointName: r.points?.name ?? null,
    createdAt: r.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPetition(pet: any): PetitionRow {
  return {
    id: pet.id,
    scope: pet.scope,
    title: pet.title,
    body: pet.body,
    officialUrl: pet.official_url,
    internalSignatures: pet.internal_signatures,
    officialSignatureCount: pet.official_signature_count,
    status: pet.status,
  };
}

export async function problemsInBbox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): Promise<ProblemMarker[]> {
  const { data, error } = await supabase.rpc('problems_in_bbox', {
    min_lng: minLng,
    min_lat: minLat,
    max_lng: maxLng,
    max_lat: maxLat,
  });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    severity: r.severity,
    confirmations: r.confirmations,
    lng: r.lng,
    lat: r.lat,
  }));
}

export async function listProblems(): Promise<ProblemRow[]> {
  const { data, error } = await supabase
    .from('problems')
    .select('id, title, description, status, severity, confirmations, photos, created_at, points(name)')
    .order('confirmations', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapProblem);
}

export async function problemById(
  id: string,
): Promise<{ problem: ProblemRow; petition: PetitionRow | null } | null> {
  const { data, error } = await supabase
    .from('problems')
    .select('id, title, description, status, severity, confirmations, photos, created_at, points(name), petitions(*)')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pet = (data as any).petitions?.[0];
  return { problem: mapProblem(data), petition: pet ? mapPetition(pet) : null };
}

/** Report a problem on a point. Returns the new problem id. */
export async function reportProblem(input: {
  pointId: string;
  title: string;
  description: string;
  severity: number;
  photos?: string[];
}): Promise<string> {
  const res = await api.post<{ id: string }>('/problems', {
    point_id: input.pointId,
    title: input.title,
    description: input.description,
    severity: input.severity,
    photos: input.photos ?? [],
  });
  return res.id;
}

/** Confirm a problem ("я теж це бачу"). Returns the new count. */
export async function confirmProblem(id: string): Promise<{ confirmations: number; status: string }> {
  return api.post<{ confirmations: number; status: string }>(`/problems/${id}/confirm`);
}

export async function createPetition(problemId: string, title: string, body: string): Promise<PetitionRow> {
  if (apiEnabled) {
    const p = await api.post<{
      id: string;
      scope: 'internal' | 'official';
      title: string;
      status: string;
      internal_signatures: number;
    }>('/petitions', { problem_id: problemId, title, body });
    return {
      id: p.id,
      scope: p.scope,
      title: p.title,
      body: body || null,
      officialUrl: null,
      internalSignatures: p.internal_signatures,
      officialSignatureCount: null,
      status: p.status,
    };
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not-authenticated');
  const { data, error } = await supabase
    .from('petitions')
    .insert({ problem_id: problemId, scope: 'internal', title, body: body || null, created_by: auth.user.id })
    .select('*')
    .single();
  if (error) throw error;
  return mapPetition(data);
}

export async function signPetition(petitionId: string): Promise<{ signatures: number }> {
  return api.post<{ signatures: number }>(`/petitions/${petitionId}/sign`);
}
