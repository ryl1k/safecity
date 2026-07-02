// Public-transport journey planning — thin client over the Go API, which owns
// all business logic (Transitous proxy, per-route accessibility, ranking,
// vehicle categories). This module only fetches and offers render helpers.
import { api, qs } from './api';

export type LegAccess = 'yes' | 'no' | 'unknown';

export interface TransitLeg {
  mode: string; // WALK | BUS | TRAM | SUBWAY | …
  route: string; // e.g. "А53", "Т08"; "" for walks
  category: string; // Автобус | Маршрутка | Трамвай | Тролейбус | …
  label: string; // "Маршрутка А43", "Пішки"
  fromName: string;
  toName: string;
  startTime: string; // ISO
  endTime: string;
  access: LegAccess; // vehicle accessibility (transit legs only)
  coords: [number, number][]; // [lng, lat] for the map
}

export interface TransitItinerary {
  durationMin: number;
  transfers: number;
  startTime: string;
  endTime: string;
  /** 'yes' — every transit leg confirmed accessible; 'unknown' — no leg is
   *  confirmed inaccessible but some lack data; 'no' — has an inaccessible leg. */
  access: LegAccess;
  legs: TransitLeg[];
}

export interface TransitPlan {
  covered: boolean;
  notice?: string; // user-facing message when covered=false
  itineraries: TransitItinerary[];
}

/** Plan a public-transport journey. Itineraries arrive ranked by the API
 *  (accessible-first unless over 2× slower). covered=false outside Lviv. */
export async function planTransit(
  from: [number, number], // [lng, lat]
  to: [number, number],
  signal?: AbortSignal,
): Promise<TransitPlan> {
  return api.get<TransitPlan>(
    `/transit/plan${qs({ from_lng: from[0], from_lat: from[1], to_lng: to[0], to_lat: to[1] })}`,
    { signal },
  );
}

export function itineraryCoords(it: TransitItinerary): [number, number][] {
  return it.legs.flatMap((l) => l.coords);
}

export function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
