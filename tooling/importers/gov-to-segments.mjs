// Tier 2: for gov pathway points that didn't snap to any existing street_segment
// (within SNAP_RADIUS m), fetch the nearest OSM footway/pedestrian/path way via
// Overpass and upsert it as a new segment — then write the decoded gov
// accessibility fields onto it.
//
// Strategy: batch points in groups of BATCH_SIZE and send one Overpass query
// per batch using around:<radius> per point. ~76 queries instead of 673 city
// bboxes — far fewer requests, no huge city-wide payloads.
//
//   node --env-file=.env tooling/importers/gov-to-segments.mjs           # dry-run
//   node --env-file=.env tooling/importers/gov-to-segments.mjs --apply   # write to DB
//   flags: --data <dir>  --snap <m> (existing snap radius, default 35)
//          --match <m>   (max distance to accept a way, default 150)
//          --batch <n>   (points per Overpass query, default 30)

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const APPLY        = args.includes('--apply');
const DATA_DIR     = argVal('--data')  || path.resolve('.bezbar-data');
const SNAP_RADIUS  = Number(argVal('--snap')  || 35);
const MATCH_RADIUS = Number(argVal('--match') || 150);
const BATCH_SIZE   = Number(argVal('--batch') || 30);
const OVERPASS     = 'https://overpass-api.de/api/interpreter';
const DELAY_MS     = 5000;

function argVal(f) { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; }

// ── Criteria decoding ─────────────────────────────────────────────────────────
const norm = s => (s || '').toLowerCase().replace(/[ʼ']/g, "'").replace(/\s+/g, ' ').trim();
const VAL  = { 'так': 'yes', 'ні': 'no' };

const FIELD_MATCHERS = [
  ['width',         /ширин[аи].{0,40}не менше ніж 1,?8|ширина тротуару не менше 1[.,]8/],
  ['curb_cuts',     /пониження борд|пониження борт|поєднані на одному (спільному )?рівні|пологі з.їзди/],
  ['obstacle_free', /немає перепон|відсутні перешкоди|вільний (від|для).{0,40}перешкод|без будь-яких перешкод для пішохідного|транзитній.{0,30}зоні тротуару немає/],
  ['step_free',     /відсутні сходи або наявні сходи і пандус/],
  ['smoothness',    /рівн[еий].{0,40}без вибоїн|тверде, ?несипуче/],
  ['tactile',       /тактильн.{0,30}(смуг|направляюч|маркуванн)|попереджувальн.{0,25}тактильн/],
  ['ramp',          /уклон пандуса|пандус на маршруті|сходинки замінені пандус|сходи.{0,25}продубльовано пандус|^пандус$/],
  ['lit',           /^освітленн|штучне освітлення|вуличне.{0,20}освітленн/],
];

function decodeFields(props, idTitle) {
  const acc = {};
  for (const cat of props.categories || []) {
    for (const cr of cat.criteria || []) {
      const val = VAL[norm(cr.value)];
      if (!val) continue;
      const title = norm(idTitle.get(cr.id));
      if (!title) continue;
      for (const [field, re] of FIELD_MATCHERS) {
        if (re.test(title)) { (acc[field] ||= []).push(val); break; }
      }
    }
  }
  const out = {};
  if (acc.width         && acc.width.includes('yes'))  out.sidewalk_width_m   = 1.8;
  if (acc.smoothness)                                   out.smoothness         = acc.smoothness.includes('no') ? 'intermediate' : 'good';
  if (acc.step_free)                                    out.is_step_free       = !acc.step_free.includes('no');
  if (acc.obstacle_free)                                out.is_obstacle_free   = !acc.obstacle_free.includes('no');
  if (acc.curb_cuts)                                    out.has_curb_cuts      = acc.curb_cuts.includes('yes');
  if (acc.tactile)                                      out.has_tactile_paving = acc.tactile.includes('yes');
  if (acc.ramp)                                         out.has_ramp           = acc.ramp.includes('yes');
  if (acc.lit)                                          out.lit                = acc.lit.includes('yes');
  return out;
}

// ── OSM tag mapping ───────────────────────────────────────────────────────────
const SURFACE_OK = new Set([
  'asphalt','concrete','paving_stones','concrete:plates','paved','wood','metal',
  'sett','concrete:lanes','compacted','fine_gravel',
  'cobblestone','unhewn_cobblestone','pebblestone','gravel','sand','ground',
  'dirt','earth','grass','mud','unpaved','rock',
]);

function osmTagsToFields(tags) {
  const out = {};
  const surface = tags.surface;
  if (surface && SURFACE_OK.has(surface)) out.surface_type = surface;
  const sm = tags.smoothness;
  if (['excellent','good','intermediate','bad','very_bad','horrible','very_horrible','impassable'].includes(sm))
    out.smoothness = sm;
  const wc = tags.wheelchair;
  if (wc === 'yes' || wc === 'designated') out.is_step_free = true;
  else if (wc === 'no') out.is_step_free = false;
  const kerb = tags.kerb;
  if (kerb === 'lowered' || kerb === 'flush') out.has_curb_cuts = true;
  else if (kerb === 'raised') out.has_curb_cuts = false;
  const tp = tags.tactile_paving;
  if (tp === 'yes' || tp === 'contrasted') out.has_tactile_paving = true;
  else if (tp === 'no') out.has_tactile_paving = false;
  if (tags.lit === 'yes') out.lit = true;
  else if (tags.lit === 'no') out.lit = false;
  const wStr = tags.width || tags['sidewalk:width'] || tags.est_width || '';
  const wNum = parseWidth(wStr);
  if (wNum) out.sidewalk_width_m = wNum;
  return out;
}

function parseWidth(v) {
  v = v.toLowerCase().replace(/\s*(meters?|metres?|m)\s*$/, '').replace(',', '.').trim();
  if (!v || /['"ft\-;~ ]/.test(v)) return null;
  const n = parseFloat(v);
  return n > 0 && n <= 20 ? n : null;
}

function segmentName(tags) {
  if (tags.name) return tags.name;
  if (tags.highway === 'pedestrian') return 'Пішохідна зона';
  if (tags.footway === 'sidewalk')   return 'Тротуар';
  return 'Пішохідна доріжка';
}

// ── Geometry ──────────────────────────────────────────────────────────────────
function haversine([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function pointToSegmentDist(P, A, B) {
  const dx = B[0]-A[0], dy = B[1]-A[1];
  if (dx === 0 && dy === 0) return haversine(P, A);
  const t = Math.max(0, Math.min(1, ((P[0]-A[0])*dx + (P[1]-A[1])*dy) / (dx*dx+dy*dy)));
  return haversine(P, [A[0]+t*dx, A[1]+t*dy]);
}

function pointToWayDist(pt, coords) {
  let min = Infinity;
  for (let i = 0; i < coords.length - 1; i++)
    min = Math.min(min, pointToSegmentDist(pt, coords[i], coords[i+1]));
  return min;
}

function coordsToWKT(coords) {
  return 'LINESTRING(' + coords.map(([lng, lat]) => `${lng.toFixed(7)} ${lat.toFixed(7)}`).join(',') + ')';
}

// ── Overpass ──────────────────────────────────────────────────────────────────

// Build one query that fetches all footway ways within MATCH_RADIUS m of each
// point in the batch — returns full node geometry.
function aroundBatchQuery(pts, radius) {
  const unions = pts.map(([lng, lat]) =>
    `  way["highway"~"^(footway|pedestrian|path)$"](around:${radius},${lat},${lng});`
  ).join('\n');
  return `[out:json][timeout:120];\n(\n${unions}\n);\nout geom;`;
}

async function overpassQuery(query) {
  const body = new URLSearchParams({ data: query });
  const backoffs = [10000, 30000, 60000];
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    const r = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded',
                  'User-Agent': 'SafeCity-gov-to-segments/1.0' },
      body,
    });
    if (r.ok) return r.json();
    const retryable = [429, 502, 503, 504].includes(r.status);
    if (!retryable || attempt === backoffs.length) throw new Error(`Overpass HTTP ${r.status}`);
    process.stdout.write(`(${r.status}, retry in ${backoffs[attempt]/1000}s) `);
    await sleep(backoffs[attempt]);
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} · snap ${SNAP_RADIUS}m · match ${MATCH_RADIUS}m · batch ${BATCH_SIZE}\n`);

  const crit = JSON.parse(await readFile(path.join(DATA_DIR, 'criteria.json'), 'utf8'));
  const idTitle = new Map(crit.map(c => [c.id, c.title]));
  const fc = JSON.parse(await readFile(path.join(DATA_DIR, 'pathways.geojson'), 'utf8'));

  let sql = null;
  if (APPLY) {
    const { default: postgres } = await import('postgres');
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
    sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });
  }

  // ── Step 1: find unmatched points ─────────────────────────────────────────
  const features = fc.features.filter(f => f.properties.lon && f.properties.lat);
  console.log(`Total pathway points with coords: ${features.length}`);

  let unmatched = [];
  if (APPLY) {
    process.stdout.write('Finding unmatched points... ');
    for (const f of features) {
      const lng = Number(f.properties.lon), lat = Number(f.properties.lat);
      const [row] = await sql`
        select id from street_segments
        where ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography, ${SNAP_RADIUS})
        limit 1`;
      if (!row) unmatched.push(f);
    }
    console.log(`${unmatched.length} unmatched`);
  } else {
    unmatched = features;
    console.log(`(Dry-run: using all ${unmatched.length} points)\n`);
  }

  if (unmatched.length === 0) { console.log('Nothing to do.'); if (sql) await sql.end(); return; }

  // ── Step 2: batch into groups of BATCH_SIZE ────────────────────────────────
  const batches = [];
  for (let i = 0; i < unmatched.length; i += BATCH_SIZE)
    batches.push(unmatched.slice(i, i + BATCH_SIZE));
  console.log(`Batches: ${batches.length} × up to ${BATCH_SIZE} points each\n`);

  const stat = { batches: 0, waysFetched: 0, matched: 0, upserted: 0, noWay: 0, failed: 0, samples: [] };

  // ── Step 3: one Overpass around-query per batch ────────────────────────────
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const pts = batch.map(f => [Number(f.properties.lon), Number(f.properties.lat)]);

    process.stdout.write(`  Batch ${bi + 1}/${batches.length} (${batch.length} pts) → Overpass ... `);

    let ways = [];
    try {
      const data = APPLY
        ? await overpassQuery(aroundBatchQuery(pts, MATCH_RADIUS))
        : { elements: [] };
      // Deduplicate ways (Overpass may return same way multiple times if multiple points are near it)
      const seen = new Set();
      ways = (data.elements || []).filter(el => {
        if (el.type !== 'way' || !el.geometry?.length >= 2) return false;
        if (seen.has(el.id)) return false;
        seen.add(el.id);
        return true;
      });
      console.log(`${ways.length} ways`);
      stat.waysFetched += ways.length;
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      stat.failed += batch.length;
      continue;
    }

    const wayCoords = ways.map(w => w.geometry.map(n => [n.lon, n.lat]));

    for (let pi = 0; pi < batch.length; pi++) {
      const f = batch[pi];
      const govPt = pts[pi];
      const govFields = decodeFields(f.properties, idTitle);

      // Find nearest way within MATCH_RADIUS
      let bestWay = null, bestCoords = null, bestDist = Infinity;
      for (let i = 0; i < ways.length; i++) {
        const d = pointToWayDist(govPt, wayCoords[i]);
        if (d < bestDist) { bestDist = d; bestWay = ways[i]; bestCoords = wayCoords[i]; }
      }

      if (!bestWay || bestDist > MATCH_RADIUS) { stat.noWay++; continue; }
      stat.matched++;

      if (stat.samples.length < 8) {
        stat.samples.push({
          city: f.properties.addressPostName || '?',
          title: f.properties.title || '?',
          osmId: bestWay.id, dist: Math.round(bestDist), govFields,
        });
      }

      if (!APPLY) continue;

      const osmFields = osmTagsToFields(bestWay.tags || {});
      const name = segmentName(bestWay.tags || {});
      const wkt  = coordsToWKT(bestCoords);

      const [seg] = await sql`
        insert into street_segments
          (street_name, geom, osm_way_id,
           surface_type, smoothness, sidewalk_width_m, lit, is_step_free,
           has_curb_cuts, has_tactile_paving, verify_status, field_sources)
        values (
          ${name},
          ST_GeomFromText(${wkt}, 4326),
          ${bestWay.id},
          ${osmFields.surface_type ?? null},
          ${osmFields.smoothness ?? null},
          ${osmFields.sidewalk_width_m ?? null},
          ${osmFields.lit ?? null},
          ${osmFields.is_step_free ?? null},
          ${osmFields.has_curb_cuts ?? null},
          ${osmFields.has_tactile_paving ?? null},
          'unverified',
          ${sql.json(Object.fromEntries(Object.keys(osmFields).map(k => [k, 'osm'])))}
        )
        on conflict (osm_way_id) where osm_way_id is not null
        do update set
          street_name        = excluded.street_name,
          geom               = excluded.geom,
          surface_type       = excluded.surface_type,
          smoothness         = coalesce(street_segments.smoothness, excluded.smoothness),
          sidewalk_width_m   = coalesce(street_segments.sidewalk_width_m, excluded.sidewalk_width_m),
          lit                = coalesce(street_segments.lit, excluded.lit),
          is_step_free       = coalesce(street_segments.is_step_free, excluded.is_step_free),
          has_curb_cuts      = coalesce(street_segments.has_curb_cuts, excluded.has_curb_cuts),
          has_tactile_paving = coalesce(street_segments.has_tactile_paving, excluded.has_tactile_paving),
          updated_at         = now()
        returning id, smoothness, sidewalk_width_m, lit, is_step_free,
                  has_curb_cuts, has_tactile_paving, is_obstacle_free, has_ramp, field_sources`;

      if (!seg) continue;
      stat.upserted++;

      // Write gov fields onto NULLs only
      const govSet = {}, govSrc = {};
      const GOV_COLS = {
        smoothness: 'smoothness', sidewalk_width_m: 'sidewalk_width_m',
        is_obstacle_free: 'obstacle_free', is_step_free: 'step_free',
        has_curb_cuts: 'curb_cuts', has_tactile_paving: 'tactile',
        has_ramp: 'ramp', lit: 'lit',
      };
      for (const [col, srcKey] of Object.entries(GOV_COLS)) {
        const govVal = govFields[col];
        if (govVal === undefined) continue;
        if (seg[col] !== null && seg[col] !== undefined) continue;
        govSet[col] = govVal;
        govSrc[srcKey] = 'gov';
      }
      if (Object.keys(govSet).length > 0) {
        await sql`
          update street_segments
          set ${sql(govSet)},
              field_sources = field_sources || ${sql.json(govSrc)},
              updated_at    = now()
          where id = ${seg.id}`;
      }
    }

    stat.batches++;
    if (APPLY && bi < batches.length - 1) await sleep(DELAY_MS);
  }

  console.log('\n=== Samples ===');
  for (const s of stat.samples)
    console.log(`  [${s.city}] "${s.title}" → way/${s.osmId} (${s.dist}m) ${JSON.stringify(s.govFields)}`);

  console.log('\n=== Summary ===');
  console.log(`Batches sent:       ${stat.batches}`);
  console.log(`OSM ways fetched:   ${stat.waysFetched}`);
  console.log(`Gov points matched: ${stat.matched}`);
  console.log(`No way within ${MATCH_RADIUS}m: ${stat.noWay}`);
  console.log(`Failed batches pts: ${stat.failed}`);
  if (APPLY) console.log(`Segments upserted:  ${stat.upserted}`);
  else       console.log('(DRY-RUN — re-run with --apply to write)');

  if (sql) await sql.end();
}

main().catch(e => { console.error('gov-to-segments failed:', e.message); process.exitCode = 1; });
