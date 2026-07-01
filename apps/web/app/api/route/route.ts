import { NextRequest } from 'next/server';

// Server-side proxy to OpenRouteService — keeps ORS_API_KEY off the client.

interface RouteBody {
  from?: [number, number];
  to?: [number, number];
  via?: [number, number][]; // intermediate waypoints in order
  profile?: string;
  avoid?: number[][][][];
  params?: { maxIncline?: number; maxSlopedKerb?: number; minWidth?: number };
}

// Ukrainian turn-by-turn from ORS maneuver type + way name (public ORS has no
// Ukrainian instruction language; street names already arrive in Ukrainian).
function uaInstruction(type: number, name?: string): string {
  if (name === '-') name = undefined; // ORS uses "-" for unnamed ways
  const on = (v: string) => (name ? `${v} на ${name}` : v);
  switch (type) {
    case 0: return on('Поверніть ліворуч');
    case 1: return on('Поверніть праворуч');
    case 2: return on('Крутий поворот ліворуч');
    case 3: return on('Крутий поворот праворуч');
    case 4: return on('Тримайтеся трохи лівіше');
    case 5: return on('Тримайтеся трохи правіше');
    case 6: return name ? `Прямо по ${name}` : 'Прямо';
    case 7: return 'Заїзд на кільце';
    case 8: return 'З’їзд з кільця';
    case 9: return 'Розворот';
    case 10: return 'Прибуття до місця призначення';
    case 11: return name ? `Рушайте по ${name}` : 'Рушайте';
    case 12: return on('Тримайтеся лівіше');
    case 13: return on('Тримайтеся правіше');
    default: return 'Продовжуйте рух';
  }
}

export async function POST(req: NextRequest) {
  const key = process.env.ORS_API_KEY?.trim();
  if (!key) return Response.json({ error: 'ORS key missing on server' }, { status: 500 });

  let body: RouteBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
  const { from, to, via = [], profile, avoid, params } = body;
  if (!from || !to) return Response.json({ error: 'from and to required' }, { status: 400 });
  const allCoords = [from, ...via, to];

  const hasAvoid = Array.isArray(avoid) && avoid.length > 0;

  function buildPayload(orsProfile: string) {
    const payload: Record<string, unknown> = { coordinates: allCoords };
    const options: Record<string, unknown> = {};
    if (hasAvoid) {
      options.avoid_polygons = { type: 'MultiPolygon', coordinates: avoid };
    }
    // Wheelchair-specific accessibility restrictions (foot profile rejects these).
    if (orsProfile === 'wheelchair') {
      options.profile_params = {
        restrictions: {
          maximum_incline: params?.maxIncline ?? 6,
          maximum_sloped_kerb: params?.maxSlopedKerb ?? 0.03,
          minimum_width: params?.minWidth ?? 0.8,
        },
      };
    }
    if (Object.keys(options).length > 0) payload.options = options;
    return payload;
  }

  async function orsRoute(orsProfile: string) {
    return fetch(`https://api.openrouteservice.org/v2/directions/${orsProfile}/geojson`, {
      method: 'POST',
      headers: { Authorization: key as string, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(orsProfile)),
    });
  }

  // Wheelchair gets the dedicated profile; blind users route on foot.
  // Lviv's OSM often lacks the data the wheelchair profile needs, so fall back to
  // foot-walking when it can't find a route — the user still gets a pedestrian path.
  const wanted = profile === 'blind' ? 'foot-walking' : 'wheelchair';
  let usedProfile = wanted;
  let res = await orsRoute(wanted);
  if (!res.ok && wanted === 'wheelchair') {
    usedProfile = 'foot-walking';
    res = await orsRoute('foot-walking');
  }

  if (!res.ok) {
    const detail = await res.text();
    return Response.json({ error: 'routing failed', detail }, { status: 502 });
  }

  const gj = await res.json();
  const f = gj.features?.[0];
  const segments: any[] = f?.properties?.segments ?? [];
  const steps = segments.flatMap((seg: any) =>
    (seg.steps ?? []).map((s: any) => ({ instruction: uaInstruction(s.type, s.name), distance: s.distance })),
  );
  return Response.json({
    profile: usedProfile,
    fallback: usedProfile !== wanted,
    avoided: hasAvoid ? avoid!.length : 0,
    coordinates: f?.geometry?.coordinates ?? [],
    steps,
    summary: f?.properties?.summary ?? null,
  });
}
