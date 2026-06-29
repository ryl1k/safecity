// Accessible routing (RN port of apps/web/app/route logic). Mobile is API-first:
// the Go API builds avoid_polygons from confirmed barriers server-side, so we just
// send from/to/profile. Falls back to a friendly error when no API is configured
// (we never embed the ORS key in the app).
import type { Profile } from '@safecity/shared';
import { api, apiEnabled } from './api';

export interface RouteStep {
  instruction: string;
  distance: number;
}

export interface RouteResult {
  coordinates: [number, number][];
  steps: RouteStep[];
  summary: { distance: number; duration: number } | null;
  fallback: boolean;
  avoided: number;
}

export class RoutingUnavailableError extends Error {
  constructor() {
    super('routing-unavailable');
    this.name = 'RoutingUnavailableError';
  }
}

export async function getRoute(
  from: [number, number],
  to: [number, number],
  profile: Profile,
): Promise<RouteResult> {
  if (!apiEnabled) throw new RoutingUnavailableError();
  const data = await api.post<Partial<RouteResult>>(
    '/route',
    { from, to, profile },
    { auth: false },
  );
  return {
    coordinates: data.coordinates ?? [],
    steps: data.steps ?? [],
    summary: data.summary ?? null,
    fallback: Boolean(data.fallback),
    avoided: data.avoided ?? 0,
  };
}
