// Tier 0: fill segment incline from a public DEM (SRTM 30 m via OpenTopoData —
// eudem25m has NO Ukraine coverage, SRTM does). Honest-limits guard: a ~±4 m DEM
// vertical noise over a short sidewalk swamps the real grade, so we only assign
// incline to segments long enough (default ≥80 m) that the noise is a few percent,
// and drop implausible >25% readings as DEM artifacts. Short segments keep a NULL
// incline (unknown) rather than a fabricated slope. Source recorded as 'dem'.
//
//   node --env-file=.env tooling/importers/incline-dem.mjs           # dry-run
//   node --env-file=.env tooling/importers/incline-dem.mjs --apply   # write to DB
//   flags: --min-len <m> (default 80)  --dataset <srtm30m|aster30m>
import process from 'node:process';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const MIN_LEN = Number(argVal('--min-len') || 80);
const DATASET = argVal('--dataset') || 'srtm30m';
function argVal(f) { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (lat, lng) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

// Batch elevation lookups: 100 locations/call, ~1 call/sec (public rate limit).
async function elevations(points) {
  const uniq = [...new Set(points.map(([lat, lng]) => key(lat, lng)))];
  const out = new Map();
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100);
    const locs = chunk.join('|');
    const url = `https://api.opentopodata.org/v1/${DATASET}?locations=${locs}`;
    let res;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(url);
      if (res.status !== 429) break;
      await sleep(2000 * (attempt + 1));
    }
    if (!res.ok) throw new Error(`OpenTopoData HTTP ${res.status}`);
    const data = await res.json();
    data.results.forEach((r, j) => out.set(chunk[j], r.elevation)); // may be null outside coverage
    process.stdout.write(`\r  elevation ${Math.min(i + 100, uniq.length)}/${uniq.length}`);
    await sleep(1100);
  }
  process.stdout.write('\n');
  return out;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} · dataset ${DATASET} · min length ${MIN_LEN} m\n`);
  const { default: postgres } = await import('postgres');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set (run with --env-file=.env)');
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

  // Segments that still lack incline and are long enough for DEM to be usable.
  const segs = await sql`
    select id,
           ST_Y(ST_StartPoint(geom)) as sy, ST_X(ST_StartPoint(geom)) as sx,
           ST_Y(ST_EndPoint(geom))   as ey, ST_X(ST_EndPoint(geom))   as ex,
           ST_Length(geom::geography) as len
    from street_segments
    where incline_percent is null and ST_Length(geom::geography) >= ${MIN_LEN}`;
  console.log(`Segments needing incline (len ≥ ${MIN_LEN} m): ${segs.length}`);
  if (segs.length === 0) { await sql.end(); return; }

  const pts = [];
  for (const s of segs) { pts.push([s.sy, s.sx], [s.ey, s.ex]); }
  const elev = await elevations(pts);

  let written = 0, noElev = 0, artifact = 0;
  const dist = { '<2%': 0, '2-6%': 0, '6-8.33%': 0, '>8.33%': 0 };
  for (const s of segs) {
    const e0 = elev.get(key(s.sy, s.sx)), e1 = elev.get(key(s.ey, s.ex));
    if (e0 == null || e1 == null) { noElev++; continue; }
    const grade = Math.round((Math.abs(e1 - e0) / s.len) * 1000) / 10; // % to 0.1
    if (grade > 25) { artifact++; continue; } // implausible for a sidewalk → DEM error
    if (grade < 2) dist['<2%']++; else if (grade < 6) dist['2-6%']++; else if (grade <= 8.33) dist['6-8.33%']++; else dist['>8.33%']++;
    if (APPLY) {
      await sql`update street_segments
        set incline_percent = ${grade}, field_sources = field_sources || '{"incline":"dem"}'::jsonb, updated_at = now()
        where id = ${s.id}`;
    }
    written++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Incline computed for: ${written}${APPLY ? ' (written)' : ' (dry-run)'}`);
  console.log(`No DEM elevation (outside coverage): ${noElev}`);
  console.log(`Dropped as artifact (>25%): ${artifact}`);
  console.log(`Grade distribution: ${JSON.stringify(dist)}`);
  await sql.end();
}

main().catch((e) => { console.error('incline-dem failed:', e.message); process.exitCode = 1; });
