// Public-transport journey planning via Transitous (free community MOTIS API).
// City surface transport only (bus/tram/metro — no rail), wheelchair walking
// profile, and per-leg vehicle accessibility from the GTFS flags.
//
// Coverage: Lviv only for now (the only Ukrainian city whose feed we've
// verified end-to-end). isTransitCovered() gates the UI.
const BASE = 'https://api.transitous.org/api/v3';

export type LegAccess = 'yes' | 'no' | 'unknown';

// Lviv city bounds — transit planning is offered only inside them.
const LVIV_BBOX = { minLng: 23.85, minLat: 49.74, maxLng: 24.22, maxLat: 49.96 };

export function isTransitCovered(from: [number, number], to: [number, number]): boolean {
  const inLviv = ([lng, lat]: [number, number]) =>
    lng >= LVIV_BBOX.minLng && lng <= LVIV_BBOX.maxLng && lat >= LVIV_BBOX.minLat && lat <= LVIV_BBOX.maxLat;
  return inLviv(from) && inLviv(to);
}

// Full per-route accessibility for Lviv, keyed by the GTFS route_short_name.
// Derived from eway.in.ua/ua/cities/lviv/routes (2026-07-02): категорії
// «Автобус» і «Тролейбус» = низькопідлогові (accessible), «Трамвай» і
// «Маршрутка» = ні. An explicit per-trip ACCESSIBLE flag from the city's GTFS
// still upgrades a trip to 'yes' (e.g. the new low-floor trams on Т08).
const LVIV_ROUTE_ACCESS: Record<string, 'yes' | 'no'> = {
  // Автобуси (низькопідлогові)
  А01: 'yes', А03: 'yes', А05: 'yes', А06: 'yes', А08а: 'yes', А09: 'yes', А10: 'yes', А11: 'yes',
  А16: 'yes', А18: 'yes', А19: 'yes', А20: 'yes', А23: 'yes', А29: 'yes', А32: 'yes', А37: 'yes',
  А40: 'yes', А46: 'yes', А47: 'yes', А48: 'yes', А49: 'yes', А51: 'yes', А52: 'yes', А53: 'yes',
  А55: 'yes', А56: 'yes', А60: 'yes', А61: 'yes', А80: 'yes', А84: 'yes', А92: 'yes', А99: 'yes',
  // Тролейбуси (низькопідлогові)
  Тр22: 'yes', Тр23: 'yes', Тр24: 'yes', Тр25: 'yes', Тр27: 'yes', Тр30: 'yes', Тр31: 'yes', Тр32: 'yes', Тр38: 'yes',
  // Трамваї
  Т01: 'no', Т02: 'no', Т03: 'no', Т04: 'no', Т06: 'no', Т07: 'no', Т08: 'no', Т09: 'no',
  // Маршрутки
  А07: 'no', А12: 'no', А14: 'no', А15: 'no', А17: 'no', А21: 'no', А22: 'no', А25: 'no',
  А27: 'no', А31: 'no', А33: 'no', А34: 'no', А39: 'no', А39а: 'no', А41: 'no', А43: 'no',
  А45: 'no', А57: 'no', А58: 'no', А59: 'no', А62: 'no', А63: 'no',
};

// Normalise a route name for lookup (latin lookalikes → cyrillic, trim).
function routeKey(route: string): string {
  return route.trim().replace(/A/g, 'А').replace(/a/g, 'а').replace(/T/g, 'Т').replace(/p/g, 'р');
}

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
  /** 'yes' — every transit leg confirmed accessible; 'unknown' — no leg is
   *  confirmed inaccessible but some lack data; 'no' — has an inaccessible leg. */
  access: LegAccess;
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

// Priority: the city's explicit per-trip ACCESSIBLE flag → the per-route
// category map (eway) → unknown. MOTIS's NOT_ACCESSIBLE is ignored as a
// signal because GTFS 0 = "no information" gets collapsed into it.
function accessOf(v: unknown, route: string | null): LegAccess {
  if (v === 'ACCESSIBLE') return 'yes';
  if (route) {
    const cat = LVIV_ROUTE_ACCESS[routeKey(route)];
    if (cat) return cat;
  }
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
    const legs: TransitLeg[] = (it.legs ?? []).map((l: any): TransitLeg => {
      const route = l.routeShortName ?? null;
      return {
        mode: l.mode,
        route,
        fromName: l.from?.name === 'START' ? '' : (l.from?.name ?? ''),
        toName: l.to?.name === 'END' ? '' : (l.to?.name ?? ''),
        startTime: l.startTime,
        endTime: l.endTime,
        accessible: l.mode === 'WALK' ? 'unknown' : accessOf(l.wheelchairAccessible, route),
        coords: l.legGeometry?.points ? decodePolyline(l.legGeometry.points, l.legGeometry.precision ?? 6) : [],
      };
    });
    const transit = legs.filter((l) => l.mode !== 'WALK');
    const access: LegAccess = transit.some((l) => l.accessible === 'no')
      ? 'no'
      : transit.length > 0 && transit.every((l) => l.accessible === 'yes')
        ? 'yes'
        : 'unknown';
    return {
      durationMin: Math.round((it.duration ?? 0) / 60),
      transfers: it.transfers ?? Math.max(0, transit.length - 1),
      startTime: it.startTime,
      endTime: it.endTime,
      access,
      legs,
    };
  });

  // Confirmed-accessible journeys first, then unknown, then faster ones.
  const rank: Record<LegAccess, number> = { yes: 0, unknown: 1, no: 2 };
  its.sort((a, b) => rank[a.access] - rank[b.access] || a.durationMin - b.durationMin);
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
