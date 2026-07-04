/** Splits a routed path into sub-segments by grade category.
 *
 *  Elevation source priority:
 *  1. AWS Terrain Tiles (Terrarium encoding) — ~5 m resolution, no key, no rate limits
 *  2. OpenTopoData EU-DEM 25 m              — fallback if tile canvas is blocked (CORS)
 *  3. Open-Elevation (SRTM)                 — last resort
 */

export interface ElevSegment {
  coords: [number, number][];
  inclinePercent: number; // average grade (signed %) for this sub-segment
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a[1]), lat2 = toRad(b[1]);
  const dLat = lat2 - lat1, dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function sampleIndices(coords: [number, number][], intervalM: number): number[] {
  const indices: number[] = [0];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    acc += haversineM(coords[i - 1]!, coords[i]!);
    if (acc >= intervalM) { indices.push(i); acc = 0; }
  }
  const last = coords.length - 1;
  if (indices[indices.length - 1] !== last) indices.push(last);
  return indices;
}

// ─── Source 1: AWS Terrain Tiles (Terrarium) ─────────────────────────────────
// Tile URL: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
// Encoding: elevation (m) = R×256 + G + B/256 − 32768
// Zoom 14 → ~9 m pixel size at Lviv's latitude (49.8°).

const ZOOM = 14;
// Module-level tile cache — persists for the lifetime of the page.
const tileCache = new Map<string, ImageData | null>();

function lngLatToTileXY(lng: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return [x, y];
}

function fetchTile(z: number, x: number, y: number): Promise<ImageData | null> {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return Promise.resolve(tileCache.get(key)!);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) { tileCache.set(key, null); return resolve(null); }
      ctx.drawImage(img, 0, 0);
      try {
        const data = ctx.getImageData(0, 0, 256, 256);
        tileCache.set(key, data);
        resolve(data);
      } catch {
        // Tainted canvas (CORS blocked) — fall through to API sources.
        tileCache.set(key, null);
        resolve(null);
      }
    };
    img.onerror = () => { tileCache.set(key, null); resolve(null); };
    img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  });
}

async function elevFromTile(lng: number, lat: number): Promise<number | null> {
  const [tx, ty] = lngLatToTileXY(lng, lat, ZOOM);
  const data = await fetchTile(ZOOM, tx, ty);
  if (!data) return null;

  const n = 2 ** ZOOM;
  const totalPx = ((lng + 180) / 360) * n * 256;
  const latRad = (lat * Math.PI) / 180;
  const totalPy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * 256;
  const px = Math.max(0, Math.min(255, Math.floor(totalPx - tx * 256)));
  const py = Math.max(0, Math.min(255, Math.floor(totalPy - ty * 256)));

  const i = (py * 256 + px) * 4;
  const R = data.data[i]!, G = data.data[i + 1]!, B = data.data[i + 2]!;
  return R * 256 + G + B / 256 - 32768;
}

async function fetchElevationsTerrain(points: [number, number][]): Promise<number[] | null> {
  // Deduplicate tile fetches — nearby points share the same tile.
  const results = await Promise.all(points.map(([lng, lat]) => elevFromTile(lng, lat)));
  if (results.some((r) => r === null)) return null;
  return results as number[];
}

// ─── Source 2: OpenTopoData EU-DEM 25 m ──────────────────────────────────────

function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  return Promise.race([
    fetch(url, init),
    new Promise<Response>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

async function fetchElevationsOTD(points: [number, number][]): Promise<number[] | null> {
  const BATCH = 100;
  const results: number[] = [];
  for (let i = 0; i < points.length; i += BATCH) {
    const locs = points.slice(i, i + BATCH).map(([lng, lat]) => `${lat},${lng}`).join('|');
    try {
      const res = await fetchWithTimeout(
        `https://api.opentopodata.org/v1/eudem25m?locations=${locs}`, {}, 7000,
      );
      if (!res.ok) return null;
      const data: { status: string; results: { elevation: number | null }[] } = await res.json();
      if (data.status !== 'OK') return null;
      for (const r of data.results) results.push(r.elevation ?? 0);
    } catch { return null; }
  }
  return results;
}

// ─── Source 3: Open-Elevation (SRTM) ─────────────────────────────────────────

async function fetchElevationsOE(points: [number, number][]): Promise<number[] | null> {
  const BATCH = 100;
  const results: number[] = [];
  for (let i = 0; i < points.length; i += BATCH) {
    const locations = points.slice(i, i + BATCH).map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
    try {
      const res = await fetchWithTimeout(
        'https://api.open-elevation.com/api/v1/lookup',
        { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ locations }) },
        8000,
      );
      if (!res.ok) return null;
      const data: { results: { elevation: number }[] } = await res.json();
      if (!data.results) return null;
      for (const r of data.results) results.push(r.elevation);
    } catch { return null; }
  }
  return results;
}

// ─── Orchestration ────────────────────────────────────────────────────────────

async function fetchElevations(points: [number, number][]): Promise<number[] | null> {
  return (
    (await fetchElevationsTerrain(points)) ??
    (await fetchElevationsOTD(points)) ??
    (await fetchElevationsOE(points))
  );
}

// ─── Grade categorisation & splitting ────────────────────────────────────────

function gradeCategory(pct: number): string {
  const abs = Math.abs(pct);
  const sign = pct >= 0 ? '+' : '-';
  if (abs < 2) return 'flat';
  if (abs < 5) return sign + 'slight';
  if (abs < 8) return sign + 'moderate';
  return sign + 'steep';
}

function smooth(grades: number[]): number[] {
  return grades.map((g, i) => {
    if (i === 0 || i === grades.length - 1) return g;
    return (grades[i - 1]! + g + grades[i + 1]!) / 3;
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function splitByElevation(
  routedCoords: [number, number][],
  sampleIntervalM = 30, // finer sampling now that tiles give ~9 m resolution
): Promise<ElevSegment[]> {
  if (routedCoords.length < 2) return [];

  const indices = sampleIndices(routedCoords, sampleIntervalM);
  const samplePoints = indices.map((i) => routedCoords[i]!);

  const elevations = await fetchElevations(samplePoints);
  if (!elevations || elevations.length !== samplePoints.length) return [];

  const rawGrades: number[] = [];
  for (let i = 0; i < indices.length - 1; i++) {
    const distM = haversineM(samplePoints[i]!, samplePoints[i + 1]!);
    const elevDiff = elevations[i + 1]! - elevations[i]!;
    rawGrades.push(distM > 0 ? (elevDiff / distM) * 100 : 0);
  }
  const grades = smooth(rawGrades);

  type Group = { startSample: number; endSample: number; grades: number[] };
  const groups: Group[] = [];
  let current: Group = { startSample: 0, endSample: 0, grades: [] };

  for (let i = 0; i < grades.length; i++) {
    const cat = gradeCategory(grades[i]!);
    const prevCat = current.grades.length
      ? gradeCategory(current.grades[current.grades.length - 1]!)
      : cat;
    if (cat !== prevCat) {
      groups.push({ ...current, endSample: i });
      current = { startSample: i, endSample: i, grades: [] };
    }
    current.grades.push(grades[i]!);
    current.endSample = i + 1;
  }
  groups.push(current);

  return groups
    .filter((g) => g.grades.length > 0)
    .map((g) => {
      const startCoordIdx = indices[g.startSample]!;
      const endCoordIdx = indices[g.endSample]!;
      const coords = routedCoords.slice(startCoordIdx, endCoordIdx + 1) as [number, number][];
      const avg = g.grades.reduce((s, v) => s + v, 0) / g.grades.length;
      return { coords, inclinePercent: Math.round(avg * 10) / 10 };
    })
    .filter((s) => s.coords.length >= 2);
}
