// Public-transport journey planning via Transitous (free community MOTIS API).
// City surface transport only (bus/tram/metro — no rail), wheelchair walking
// profile, and per-leg vehicle accessibility straight from the GTFS flags.
const BASE = 'https://api.transitous.org/api/v3';

export type LegAccess = 'yes' | 'no' | 'unknown';

export interface TransitLeg {
  mode: string; // WALK | BUS | TRAM | SUBWAY | …
  route: string | null; // e.g. "А53", "Т08"
  fromName: string;
  toName: string;
  startTime: string; // ISO
  endTime: string;
  accessible: LegAccess; // vehicle accessibility (transit legs only)
  coords: [number, number][]; // [lng, lat] for the map
}

export interface TransitItinerary {
  durationMin: number;
  transfers: number;
  startTime: string;
  endTime: string;
  allAccessible: boolean; // every transit leg is wheelchair-accessible
  legs: TransitLeg[];
}

// Google-encoded polyline → [lng, lat][] (precision comes with each leg).
function decodePolyline(str: string, precision: number): [number, number][] {
  const f = 10 ** precision;
  const out: [number, number][] = [];
  let idx = 0, lat = 0, lng = 0;
  while (idx < str.length) {
    for (const which of [0, 1] as const) {
      let result = 0, shift = 0, b: number;
      do {
        b = str.charCodeAt(idx++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push([lng / f, lat / f]);
  }
  return out;
}

function accessOf(v: unknown): LegAccess {
  if (v === 'ACCESSIBLE') return 'yes';
  if (v === 'NOT_ACCESSIBLE') return 'no';
  return 'unknown';
}

/** Plan a public-transport journey. Returns itineraries sorted with fully
 *  accessible ones first (then by duration). Empty array = nothing found. */
export async function planTransit(
  from: [number, number], // [lng, lat]
  to: [number, number],
  signal?: AbortSignal,
): Promise<TransitItinerary[]> {
  const qs = new URLSearchParams({
    fromPlace: `${from[1]},${from[0]}`,
    toPlace: `${to[1]},${to[0]}`,
    time: new Date().toISOString(),
    pedestrianProfile: 'WHEELCHAIR',
    transitModes: 'BUS,TRAM,SUBWAY',
  });
  const res = await fetch(`${BASE}/plan?${qs}`, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`transitous ${res.status}`);
  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = json.itineraries ?? [];

  const its = raw.map((it): TransitItinerary => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legs: TransitLeg[] = (it.legs ?? []).map((l: any): TransitLeg => ({
      mode: l.mode,
      route: l.routeShortName ?? null,
      fromName: l.from?.name === 'START' ? '' : (l.from?.name ?? ''),
      toName: l.to?.name === 'END' ? '' : (l.to?.name ?? ''),
      startTime: l.startTime,
      endTime: l.endTime,
      accessible: l.mode === 'WALK' ? 'unknown' : accessOf(l.wheelchairAccessible),
      coords: l.legGeometry?.points ? decodePolyline(l.legGeometry.points, l.legGeometry.precision ?? 6) : [],
    }));
    const transit = legs.filter((l) => l.mode !== 'WALK');
    return {
      durationMin: Math.round((it.duration ?? 0) / 60),
      transfers: it.transfers ?? Math.max(0, transit.length - 1),
      startTime: it.startTime,
      endTime: it.endTime,
      allAccessible: transit.length > 0 && transit.every((l) => l.accessible === 'yes'),
      legs,
    };
  });

  // Fully accessible journeys first, then faster ones.
  its.sort((a, b) => Number(b.allAccessible) - Number(a.allAccessible) || a.durationMin - b.durationMin);
  return its.slice(0, 6);
}

export function itineraryCoords(it: TransitItinerary): [number, number][] {
  return it.legs.flatMap((l) => l.coords);
}

const MODE_UA: Record<string, string> = {
  BUS: 'Автобус', TRAM: 'Трамвай', SUBWAY: 'Метро', METRO: 'Метро', WALK: 'Пішки',
};

export function legLabel(l: TransitLeg): string {
  const mode = MODE_UA[l.mode] ?? l.mode;
  return l.route ? `${mode} ${l.route}` : mode;
}

export function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
