import { NextRequest } from 'next/server';

// Server-side proxy to OpenRouteService — keeps ORS_API_KEY off the client.
export async function POST(req: NextRequest) {
  const key = process.env.ORS_API_KEY?.trim();
  if (!key) return Response.json({ error: 'ORS key missing on server' }, { status: 500 });

  let body: { from?: [number, number]; to?: [number, number]; profile?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
  const { from, to, profile } = body;
  if (!from || !to) return Response.json({ error: 'from and to required' }, { status: 400 });

  // Wheelchair gets the dedicated profile; blind users route on foot.
  const orsProfile = profile === 'blind' ? 'foot-walking' : 'wheelchair';

  const res = await fetch(`https://api.openrouteservice.org/v2/directions/${orsProfile}/geojson`, {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates: [from, to] }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return Response.json({ error: 'routing failed', detail }, { status: 502 });
  }

  const gj = await res.json();
  const f = gj.features?.[0];
  const seg = f?.properties?.segments?.[0];
  return Response.json({
    coordinates: f?.geometry?.coordinates ?? [],
    steps: (seg?.steps ?? []).map((s: any) => ({ instruction: s.instruction, distance: s.distance })),
    summary: f?.properties?.summary ?? (seg ? { distance: seg.distance, duration: seg.duration } : null),
  });
}
