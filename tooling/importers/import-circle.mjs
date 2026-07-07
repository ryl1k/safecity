/**
 * Full circle import pipeline for SafeCity hackathon demo.
 *
 * Steps:
 *  1. TRUNCATE street_segments + reset pgRouting topology
 *  2. Fetch ALL walkable OSM ways within RADIUS_M of center via Overpass
 *  3. Insert them with OSM tag → DB column mapping
 *  4. Rebuild pgRouting topology (pgr_createTopology)
 *  5. Enrich segments from pathways.geojson gov data (points inside circle only)
 *  6. Fill missing incline_percent via AWS Terrarium DEM tiles
 *
 * Usage:
 *   node --env-file=.env tooling/importers/import-circle.mjs           # dry-run
 *   node --env-file=.env tooling/importers/import-circle.mjs --apply   # write to DB
 */

import pg from 'pg';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const args    = process.argv.slice(2);
const APPLY   = args.includes('--apply');
const DATA_DIR = path.resolve('.bezbar-data');

// ── Coverage circle ───────────────────────────────────────────────────────────
const CENTER_LNG = 24.0318;
const CENTER_LAT = 49.8419;
const RADIUS_M   = 1500;

// ── OSM / Overpass ────────────────────────────────────────────────────────────
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const OSM_HIGHWAY_RE = '^(footway|path|pedestrian|steps|cycleway|living_street|residential|service|unclassified|tertiary|secondary|primary|trunk)$';

// ── DEM ───────────────────────────────────────────────────────────────────────
const DEM_ZOOM   = 14;
const DEM_BASE   = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const tileCache  = new Map(); // "{z}/{x}/{y}" → Float32Array of elevations (256×256)

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function haversine([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function insideCircle(lng, lat) {
  return haversine([lng, lat], [CENTER_LNG, CENTER_LAT]) <= RADIUS_M;
}

function coordsToWKT(coords) {
  return 'LINESTRING(' + coords.map(([lng, lat]) => `${lng.toFixed(7)} ${lat.toFixed(7)}`).join(',') + ')';
}

// ── OSM tag → DB column mapping ───────────────────────────────────────────────
const SURFACE_VALID = new Set([
  'asphalt','concrete','paving_stones','concrete:plates','paved','wood','metal',
  'sett','concrete:lanes','compacted','fine_gravel',
  'cobblestone','unhewn_cobblestone','pebblestone','gravel','sand','ground',
  'dirt','earth','grass','mud','unpaved','rock',
]);

function osmTagsToFields(tags, highwayType) {
  const out = {};
  if (tags.surface && SURFACE_VALID.has(tags.surface)) out.surface_type = tags.surface;
  const sm = tags.smoothness;
  if (['excellent','good','intermediate','bad','very_bad','horrible','very_horrible','impassable'].includes(sm))
    out.smoothness = sm;
  // steps are never step-free
  if (highwayType === 'steps') out.is_step_free = false;
  else {
    const wc = tags.wheelchair;
    if (wc === 'yes' || wc === 'designated') out.is_step_free = true;
    else if (wc === 'no')                    out.is_step_free = false;
  }
  const kerb = tags.kerb;
  if (kerb === 'lowered' || kerb === 'flush') out.has_curb_cuts = true;
  else if (kerb === 'raised')                 out.has_curb_cuts = false;
  const tp = tags.tactile_paving;
  if (tp === 'yes' || tp === 'contrasted') out.has_tactile_paving = true;
  else if (tp === 'no')                    out.has_tactile_paving = false;
  if (tags.lit === 'yes')      out.lit = true;
  else if (tags.lit === 'no')  out.lit = false;
  const wStr = tags.width || tags['sidewalk:width'] || tags.est_width || '';
  const wNum = parseWidth(wStr);
  if (wNum) out.sidewalk_width_m = wNum;
  const incline = parseIncline(tags.incline || '');
  if (incline !== null) out.incline_percent = incline;
  return out;
}

function parseWidth(v) {
  v = String(v).toLowerCase().replace(/\s*(meters?|metres?|m)\s*$/, '').replace(',', '.').trim();
  if (!v || /['"ft\-;~ ]/.test(v)) return null;
  const n = parseFloat(v);
  return n > 0 && n <= 20 ? n : null;
}

function parseIncline(v) {
  v = String(v).trim().replace('%', '').replace(',', '.');
  if (!v || v === 'up' || v === 'down') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function segmentName(tags) {
  if (tags.name)                       return tags.name;
  if (tags.highway === 'pedestrian')   return 'Пішохідна зона';
  if (tags.footway === 'sidewalk')     return 'Тротуар';
  if (tags.highway === 'steps')        return 'Сходи';
  if (tags.highway === 'cycleway')     return 'Велодоріжка';
  return 'Пішохідна доріжка';
}

// ── Gov criteria decoding (reused from pathways-gov.mjs) ─────────────────────
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

function decodeGovFields(props, idTitle) {
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
  if (acc.width         && acc.width.includes('yes'))   out.sidewalk_width_m   = 1.8;
  if (acc.smoothness)                                    out.smoothness         = acc.smoothness.includes('no') ? 'intermediate' : 'good';
  if (acc.step_free)                                     out.is_step_free       = !acc.step_free.includes('no');
  if (acc.obstacle_free)                                 out.is_obstacle_free   = !acc.obstacle_free.includes('no');
  if (acc.curb_cuts)                                     out.has_curb_cuts      = acc.curb_cuts.includes('yes');
  if (acc.tactile)                                       out.has_tactile_paving = acc.tactile.includes('yes');
  if (acc.ramp)                                          out.has_ramp           = acc.ramp.includes('yes');
  if (acc.lit)                                           out.lit                = acc.lit.includes('yes');
  return out;
}

// ── DEM (AWS Terrarium elevation tiles) ───────────────────────────────────────
function lngLatToTilePixel(lng, lat, z) {
  const n = 2 ** z;
  const tx = Math.floor((lng + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const ty = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  const px = Math.floor(((lng + 180) / 360 * n - tx) * 256);
  const py = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n - ty) * 256);
  return { tx, ty, px: Math.min(px, 255), py: Math.min(py, 255) };
}

async function fetchTileElevations(tx, ty, z) {
  const key = `${z}/${tx}/${ty}`;
  if (tileCache.has(key)) return tileCache.get(key);

  const url = `${DEM_BASE}/${z}/${tx}/${ty}.png`;
  let buf;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    buf = Buffer.from(await res.arrayBuffer());
  } catch { return null; }

  // Decode PNG using pngjs
  let PNG;
  try { ({ PNG } = require('pngjs')); } catch {
    console.warn('  [DEM] pngjs not installed — skipping elevation. Run: npm install pngjs --no-save');
    return null;
  }

  return new Promise((resolve) => {
    const png = new PNG();
    png.parse(buf, (err, data) => {
      if (err) { resolve(null); return; }
      // Terrarium: elevation = R*256 + G + B/256 - 32768
      const elevs = new Float32Array(256 * 256);
      for (let i = 0; i < 256 * 256; i++) {
        const r = data.data[i * 4], g = data.data[i * 4 + 1], b = data.data[i * 4 + 2];
        elevs[i] = r * 256 + g + b / 256 - 32768;
      }
      tileCache.set(key, elevs);
      resolve(elevs);
    });
  });
}

async function getElevation(lng, lat) {
  const { tx, ty, px, py } = lngLatToTilePixel(lng, lat, DEM_ZOOM);
  const elevs = await fetchTileElevations(tx, ty, DEM_ZOOM);
  if (!elevs) return null;
  return elevs[py * 256 + px];
}

async function calcIncline(coords) {
  if (coords.length < 2) return null;
  const [startLng, startLat] = coords[0];
  const [endLng,   endLat]   = coords[coords.length - 1];
  const [elevStart, elevEnd] = await Promise.all([
    getElevation(startLng, startLat),
    getElevation(endLng,   endLat),
  ]);
  if (elevStart === null || elevEnd === null) return null;
  const lengthM = haversine(coords[0], coords[coords.length - 1]);
  if (lengthM < 1) return null;
  return ((elevEnd - elevStart) / lengthM) * 100;
}

// ── Overpass ──────────────────────────────────────────────────────────────────
async function overpassFetch(query) {
  const body = new URLSearchParams({ data: query });
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'SafeCity-circle-import/1.0' },
      body,
    });
    if (r.ok) return r.json();
    if (![429, 502, 503, 504].includes(r.status)) throw new Error(`Overpass HTTP ${r.status}`);
    const wait = [15000, 30000, 60000][attempt] ?? 60000;
    process.stdout.write(`  (${r.status} retry in ${wait/1000}s) `);
    await sleep(wait);
  }
  throw new Error('Overpass: too many retries');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nSafeCity circle import — center (${CENTER_LNG}, ${CENTER_LAT}), radius ${RADIUS_M}m`);
  console.log(`Mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY-RUN (pass --apply to write)'}\n`);

  let client = null;
  if (APPLY) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    console.log('DB connected\n');
  }

  // ── Step 1: Truncate ───────────────────────────────────────────────────────
  console.log('Step 1: Clearing existing segments...');
  if (APPLY) {
    await client.query('TRUNCATE street_segments CASCADE');
    // CASCADE also drops street_segments_vertices_pgr rows
    console.log('  Truncated street_segments\n');
  } else {
    console.log('  (dry-run: skipped)\n');
  }

  // ── Step 2: Fetch OSM ways ─────────────────────────────────────────────────
  console.log('Step 2: Fetching OSM ways from Overpass...');
  const osmQuery = `[out:json][timeout:60];
(
  way["highway"~"${OSM_HIGHWAY_RE}"](around:${RADIUS_M},${CENTER_LAT},${CENTER_LNG});
);
out geom;`;

  process.stdout.write('  Querying Overpass... ');
  const osmData = await overpassFetch(osmQuery);
  const ways = (osmData.elements || []).filter(e => e.type === 'way' && e.geometry?.length >= 2);
  console.log(`${ways.length} ways\n`);

  // ── Step 3: Insert segments ────────────────────────────────────────────────
  console.log('Step 3: Inserting segments...');
  const stat = { inserted: 0, skipped: 0 };
  const insertedIds = []; // {id, coords, incline_percent}

  for (const way of ways) {
    const coords = way.geometry.map(n => [n.lon, n.lat]);
    const tags   = way.tags || {};
    const fields = osmTagsToFields(tags, tags.highway);
    const name   = segmentName(tags);
    const wkt    = coordsToWKT(coords);

    if (!APPLY) { stat.inserted++; continue; }

    try {
      const sources = Object.fromEntries(Object.keys(fields).map(k => [k, 'osm']));
      const res = await client.query(
        `INSERT INTO street_segments
           (street_name, geom, osm_way_id,
            surface_type, smoothness, sidewalk_width_m, lit, is_step_free,
            has_curb_cuts, has_tactile_paving, incline_percent, verify_status, field_sources)
         VALUES ($1, ST_GeomFromText($2,4326), $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unverified', $12)
         ON CONFLICT (osm_way_id) WHERE osm_way_id IS NOT NULL
         DO UPDATE SET
           street_name      = excluded.street_name,
           geom             = excluded.geom,
           surface_type     = COALESCE(excluded.surface_type, street_segments.surface_type),
           smoothness       = COALESCE(excluded.smoothness, street_segments.smoothness),
           sidewalk_width_m = COALESCE(excluded.sidewalk_width_m, street_segments.sidewalk_width_m),
           lit              = COALESCE(excluded.lit, street_segments.lit),
           is_step_free     = COALESCE(excluded.is_step_free, street_segments.is_step_free),
           has_curb_cuts    = COALESCE(excluded.has_curb_cuts, street_segments.has_curb_cuts),
           has_tactile_paving = COALESCE(excluded.has_tactile_paving, street_segments.has_tactile_paving),
           incline_percent  = COALESCE(excluded.incline_percent, street_segments.incline_percent),
           updated_at       = now()
         RETURNING id, incline_percent`,
        [
          name, wkt, way.id,
          fields.surface_type     ?? null,
          fields.smoothness       ?? null,
          fields.sidewalk_width_m ?? null,
          fields.lit              ?? null,
          fields.is_step_free     ?? null,
          fields.has_curb_cuts    ?? null,
          fields.has_tactile_paving ?? null,
          fields.incline_percent  ?? null,
          JSON.stringify(sources),
        ]
      );
      if (res.rows[0]) {
        stat.inserted++;
        insertedIds.push({ id: res.rows[0].id, coords, hasIncline: res.rows[0].incline_percent !== null });
      }
    } catch (e) {
      stat.skipped++;
      if (stat.skipped <= 3) console.warn(`  Insert failed (way ${way.id}): ${e.message}`);
    }
  }
  console.log(`  Inserted: ${stat.inserted}, skipped: ${stat.skipped}\n`);

  // ── Step 4: pgRouting topology ─────────────────────────────────────────────
  console.log('Step 4: Rebuilding pgRouting topology...');
  if (APPLY) {
    process.stdout.write('  pgr_createTopology... ');
    await client.query(`SELECT pgr_createTopology('street_segments', 0.00001, 'geom', 'seg_id', 'source', 'target')`);
    console.log('done\n');
  } else {
    console.log('  (dry-run: skipped)\n');
  }

  // ── Step 5: Enrich from pathways.geojson ──────────────────────────────────
  console.log('Step 5: Enriching from pathways.geojson (gov data)...');
  const critFile = path.join(DATA_DIR, 'criteria.json');
  const pathFile = path.join(DATA_DIR, 'pathways.geojson');
  const crit = JSON.parse(await readFile(critFile, 'utf8'));
  const idTitle = new Map(crit.map(c => [c.id, c.title]));
  const fc = JSON.parse(await readFile(pathFile, 'utf8'));

  const govFeatures = (fc.features || []).filter(f => {
    const lng = Number(f.properties?.lon), lat = Number(f.properties?.lat);
    return Number.isFinite(lng) && Number.isFinite(lat) && insideCircle(lng, lat);
  });
  console.log(`  Gov points inside circle: ${govFeatures.length}`);

  const govStat = { decoded: 0, snapped: 0, noSegment: 0, nothingNew: 0 };
  for (const f of govFeatures) {
    const lng = Number(f.properties.lon), lat = Number(f.properties.lat);
    const fields = decodeGovFields(f.properties, idTitle);
    if (Object.keys(fields).length === 0) continue;
    govStat.decoded++;
    if (!APPLY) continue;

    const res = await client.query(
      `SELECT id, smoothness, sidewalk_width_m, is_step_free, is_obstacle_free,
              has_curb_cuts, has_tactile_paving, has_ramp, lit, field_sources
       FROM street_segments
       WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, 35)
       ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
       LIMIT 1`,
      [lng, lat]
    );
    if (!res.rows[0]) { govStat.noSegment++; continue; }

    const seg = res.rows[0];
    const setFields = {}, srcFields = {};
    const COL_MAP = {
      sidewalk_width_m: 'width', smoothness: 'smoothness',
      is_obstacle_free: 'obstacle_free', is_step_free: 'step_free',
      has_curb_cuts: 'curb_cuts', has_tactile_paving: 'tactile',
      has_ramp: 'ramp', lit: 'lit',
    };
    for (const [col, srcKey] of Object.entries(COL_MAP)) {
      if (fields[col] === undefined) continue;
      if (seg[col] !== null && seg[col] !== undefined) continue;
      setFields[col] = fields[col];
      srcFields[srcKey] = 'gov';
    }
    if (Object.keys(setFields).length === 0) { govStat.nothingNew++; continue; }

    const setClauses = Object.keys(setFields).map((k, i) => `${k} = $${i + 3}`).join(', ');
    const vals = [JSON.stringify(srcFields), seg.id, ...Object.values(setFields)];
    await client.query(
      `UPDATE street_segments SET ${setClauses}, field_sources = field_sources || $1::jsonb, updated_at = now() WHERE id = $2`,
      vals
    );
    govStat.snapped++;
  }
  console.log(`  Decoded: ${govStat.decoded}, snapped: ${govStat.snapped}, no segment: ${govStat.noSegment}, nothing new: ${govStat.nothingNew}\n`);

  // ── Step 6: DEM incline for segments missing it ────────────────────────────
  console.log('Step 6: Filling incline_percent via AWS DEM tiles...');
  const needIncline = APPLY
    ? (await client.query('SELECT id, ST_AsGeoJSON(geom) as geojson FROM street_segments WHERE incline_percent IS NULL')).rows
    : insertedIds.filter(r => !r.hasIncline).map(r => ({ id: r.id, coords: r.coords }));

  console.log(`  Segments needing incline: ${needIncline.length}`);

  // Install pngjs check
  let pngjsOk = false;
  try { require.resolve('pngjs'); pngjsOk = true; } catch { /* not installed */ }
  if (!pngjsOk) {
    console.log('  pngjs not found — installing...');
    const { execSync } = await import('node:child_process');
    execSync('npm install pngjs --no-save', { stdio: 'inherit' });
    pngjsOk = true;
  }

  let demUpdated = 0, demFailed = 0;
  for (let i = 0; i < needIncline.length; i++) {
    const row = needIncline[i];
    let coords;
    if (row.geojson) {
      const geo = JSON.parse(row.geojson);
      coords = geo.coordinates; // [[lng,lat],...]
    } else {
      coords = row.coords;
    }
    if (!coords || coords.length < 2) continue;

    const incline = await calcIncline(coords);
    if (incline === null) { demFailed++; continue; }

    if (APPLY) {
      await client.query(
        `UPDATE street_segments SET incline_percent = $1, field_sources = field_sources || '{"incline":"dem"}'::jsonb, updated_at = now() WHERE id = $2`,
        [Math.round(incline * 10) / 10, row.id]
      );
    }
    demUpdated++;

    if ((i + 1) % 500 === 0) process.stdout.write(`  ${i + 1}/${needIncline.length} done\r`);
  }
  console.log(`  DEM incline filled: ${demUpdated}, failed: ${demFailed}\n`);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log('=== Import complete ===');
  console.log(`OSM ways inserted:    ${stat.inserted}`);
  console.log(`Gov points snapped:   ${govStat.snapped}`);
  console.log(`DEM inclines filled:  ${demUpdated}`);
  if (!APPLY) console.log('\nRe-run with --apply to write to DB.');

  if (client) await client.end();
}

main().catch(e => { console.error('\nImport failed:', e.message, e.stack); process.exitCode = 1; });
