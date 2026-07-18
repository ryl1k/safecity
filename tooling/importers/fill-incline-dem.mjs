// Fill incline_percent for all street_segments with NULL incline using
// AWS Terrarium DEM tiles (zoom 14). Tiles are cached in-memory so each
// unique tile is fetched only once (~14 tiles cover all of Lviv).
//
//   node --env-file=.env tooling/importers/fill-incline-dem.mjs           # dry-run
//   node --env-file=.env tooling/importers/fill-incline-dem.mjs --apply   # write to DB
import { PNG } from 'pngjs';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const ZOOM = 14;
const CONCURRENCY = 8;
const BATCH = 500;

// ── DEM helpers ────────────────────────────────────────────────────────────────
const tileCache = new Map();

function latLngToTile(lat, lng, z) {
  const n = Math.pow(2, z);
  const x = Math.floor((lng + 180) / 360 * n);
  const sinLat = Math.sin(lat * Math.PI / 180);
  const y = Math.floor((0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n);
  return { x, y, z };
}

async function getTilePixels(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key);
  try {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) { tileCache.set(key, null); return null; }
    const buf = Buffer.from(await res.arrayBuffer());
    const png = PNG.sync.read(buf);
    tileCache.set(key, png);
    return png;
  } catch { tileCache.set(key, null); return null; }
}

async function getElevation(lat, lng) {
  const { x, y, z } = latLngToTile(lat, lng, ZOOM);
  const png = await getTilePixels(z, x, y);
  if (!png) return null;
  const n = Math.pow(2, z);
  const pixX = Math.floor(((lng + 180) / 360 * n - x) * 256);
  const sinLat = Math.sin(lat * Math.PI / 180);
  const pixY = Math.floor((0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n * 256 - y * 256);
  const px = Math.max(0, Math.min(255, pixX));
  const py = Math.max(0, Math.min(255, pixY));
  const idx = (py * png.width + px) * 4;
  const R = png.data[idx], G = png.data[idx + 1], B = png.data[idx + 2];
  return R * 256 + G + B / 256 - 32768;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Main ───────────────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

// Fetch all segments with NULL incline — get start and end points from geom.
const { rows: segments } = await client.query(`
  select
    id,
    ST_X(ST_StartPoint(geom)) as start_lng,
    ST_Y(ST_StartPoint(geom)) as start_lat,
    ST_X(ST_EndPoint(geom))   as end_lng,
    ST_Y(ST_EndPoint(geom))   as end_lat
  from street_segments
  where incline_percent is null
`);

console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`Segments needing incline: ${segments.length}`);

let filled = 0, failed = 0, skipped = 0;

for (let i = 0; i < segments.length; i += CONCURRENCY) {
  const chunk = segments.slice(i, i + CONCURRENCY);
  await Promise.all(chunk.map(async s => {
    const [elevStart, elevEnd] = await Promise.all([
      getElevation(s.start_lat, s.start_lng),
      getElevation(s.end_lat, s.end_lng),
    ]);
    if (elevStart === null || elevEnd === null) { failed++; return; }
    const lenM = haversine(s.start_lat, s.start_lng, s.end_lat, s.end_lng);
    if (lenM <= 1) { skipped++; return; }
    const raw = ((elevEnd - elevStart) / lenM) * 100;
    const incline = Math.round(Math.max(-999, Math.min(999, raw)) * 10) / 10;
    s.incline = incline;
    filled++;
  }));

  if ((i / CONCURRENCY) % 100 === 0 || i + CONCURRENCY >= segments.length) {
    process.stdout.write(`  ${Math.min(i + CONCURRENCY, segments.length)}/${segments.length} (tiles cached: ${tileCache.size})\r`);
  }
}
console.log(`\nFilled: ${filled}, failed (no tile): ${failed}, skipped (<1m): ${skipped}`);

if (APPLY) {
  // Batch update
  const toUpdate = segments.filter(s => s.incline !== undefined);
  console.log(`Writing ${toUpdate.length} updates to DB...`);
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const batch = toUpdate.slice(i, i + BATCH);
    const ids = batch.map(s => s.id);
    const inclines = batch.map(s => s.incline);
    await client.query(`
      update street_segments
      set incline_percent = v.incline, updated_at = now()
      from (select unnest($1::uuid[]) as id, unnest($2::numeric[]) as incline) v
      where street_segments.id = v.id
    `, [ids, inclines]);
    process.stdout.write(`  updated ${Math.min(i + BATCH, toUpdate.length)}/${toUpdate.length}\r`);
  }
  console.log('\nDone.');
} else {
  const sample = segments.filter(s => s.incline !== undefined).slice(0, 5);
  console.log('Sample (dry-run):');
  for (const s of sample) console.log(`  id=${s.id} incline=${s.incline}%`);
  console.log('Re-run with --apply to write.');
}

await client.end();
