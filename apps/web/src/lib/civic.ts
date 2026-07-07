import type { ProblemStatus } from '@safecity/shared';
import { api, qs } from './api';

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

interface ApiProblem {
  id: string;
  title: string;
  description: string | null;
  status: ProblemStatus;
  severity: number;
  confirmations: number;
  photos: string[] | null;
  point_name: string | null;
  created_at: string;
}

function mapProblem(r: ApiProblem): ProblemRow {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    severity: r.severity,
    confirmations: r.confirmations,
    photos: r.photos ?? [],
    pointName: r.point_name,
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
  return api.get<ProblemMarker[]>(
    `/problems/bbox${qs({ min_lng: minLng, min_lat: minLat, max_lng: maxLng, max_lat: maxLat })}`,
  );
}

export async function listProblems(): Promise<ProblemRow[]> {
  const rows = await api.get<ApiProblem[]>('/problems');
  return rows.map(mapProblem);
}

interface ApiPetition {
  id: string;
  scope: 'internal' | 'official';
  title: string;
  body: string | null;
  official_url: string | null;
  internal_signatures: number;
  official_signature_count: number | null;
  status: string;
}

function mapPetition(p: ApiPetition): PetitionRow {
  return {
    id: p.id,
    scope: p.scope,
    title: p.title,
    body: p.body,
    officialUrl: p.official_url,
    internalSignatures: p.internal_signatures,
    officialSignatureCount: p.official_signature_count,
    status: p.status,
  };
}

/** Community-create an internal petition for a problem (escalation step). */
export async function createPetition(
  problemId: string,
  title: string,
  body: string,
): Promise<PetitionRow> {
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

export async function problemById(
  id: string,
): Promise<{ problem: ProblemRow; petition: PetitionRow | null } | null> {
  try {
    const res = await api.get<{ problem: ApiProblem; petition: ApiPetition | null }>(`/problems/${id}`);
    return {
      problem: mapProblem(res.problem),
      petition: res.petition ? mapPetition(res.petition) : null,
    };
  } catch {
    return null; // page shows "not found"
  }
}
