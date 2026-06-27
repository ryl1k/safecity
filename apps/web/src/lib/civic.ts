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

export interface ProblemMarker {
  id: string;
  title: string;
  status: ProblemStatus;
  severity: number;
  confirmations: number;
  lng: number;
  lat: number;
}

/** Open problems with a location, inside a map bounding box (problems map layer). */
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
    .select('id, title, description, status, severity, confirmations, created_at, points(name)')
    .order('confirmations', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapProblem);
}

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

/** Community-create an internal petition for a problem (escalation step). */
export async function createPetition(
  problemId: string,
  title: string,
  body: string,
): Promise<PetitionRow> {
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
    petition: pet ? mapPetition(pet) : null,
  };
}
