/**
 * Re-imports OSM ways split at intersection nodes for a properly connected routing graph.
 *
 * The previous import stored each OSM way as a single segment. Ways that share
 * only INTERIOR nodes (not endpoints) were never connected in the pgRouting
 * topology, leaving 1400+ disconnected components.
 *
 * This script:
 *   1. Fetches OSM ways + nodes (with node-ID membership) via Overpass
 *   2. Finds intersection nodes (nodes that appear in 2+ ways, or at way endpoints)
 *   3. Splits each way at those nodes into sub-segments
 *   4. TRUNCATEs street_segments and re-inserts the sub-segments
 *   5. Runs pgr_createTopology to build the routing graph
 *   6. Enriches from pathways.geojson (gov data)
 *   7. Fills incline via AWS Terrarium DEM tiles
 *
 * Usage:
 *   node --env-file=.env tooling/importers/reimport-split.mjs          # dry-run
 *   node --env-file=.env tooling/importers/reimport-split.mjs --apply  # write to DB
 */
import pg from 'pg';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = !process.argv.includes('--apply');
if (DRY_RUN) console.log('DRY RUN — pass --apply to write to DB\n');

// ── Config ────────────────────────────────────────────────────────────────────
const CENTER_LAT = 49.8419;
const CENTER_LNG = 24.0318;
const RADIUS_M   = 2200;

const HIGHWAY_FILTER = [
  'footway','path','pedestrian','steps','service','residential',
  'primary','secondary','tertiary','living_street','unclassified',
  'track','cycleway','corridor',
].join('|');

// ── Overpass ──────────────────────────────────────────────────────────────────
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

async function fetchOverpass(query) {
  let lastErr;
  for (const url of OVERPASS_MIRRORS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`  Trying ${url.replace('https://', '')}...`);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'SafeCity/1.0' },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(150_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        lastErr = err;
        console.log(`  ${url.split('/')[2]} attempt ${attempt} failed (${err.message})`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 10000));
      }
    }
  }
  throw lastErr;
}

// ── OSM tag → DB field mapping ────────────────────────────────────────────────
function parseSurface(tags) {
  const s = tags.surface;
  if (!s) return null;
  const map = {
    asphalt:'asphalt', paved:'paved', concrete:'concrete', paving_stones:'paving_stones',
    sett:'sett', cobblestone:'cobblestone', unhewn_cobblestone:'cobblestone',
    grass:'grass', dirt:'dirt', gravel:'gravel', fine_gravel:'fine_gravel',
    compacted:'compacted', wood:'wood', metal:'metal', rubber:'rubber',
    mud:'mud', sand:'sand', ground:'ground', unpaved:'unpaved',
    pebblestone:'gravel', stepping_stones:'stepping_stones',
  };
  return map[s] ?? s;
}
function parseSmoothness(tags) {
  const s = tags.smoothness;
  if (!s) return null;
  const allowed = ['excellent','good','intermediate','bad','very_bad','horrible','very_horrible','impassable'];
  return allowed.includes(s) ? s : null;
}
function parseWidth(tags) {
  const w = tags.width ?? tags['sidewalk:width'] ?? tags['est_width'];
  if (!w) return null;
  const n = parseFloat(w);
  return isNaN(n) ? null : n;
}
function parseLit(tags) {
  if (tags.lit === 'yes') return true;
  if (tags.lit === 'no')  return false;
  return null;
}
function parseStepFree(tags) {
  if (tags.highway === 'steps') return false;
  if (tags.wheelchair === 'yes') return true;
  if (tags.wheelchair === 'no')  return false;
  if (tags.wheelchair === 'designated') return true;
  return null;
}
function parseCurbCuts(tags) {
  if (tags.kerb === 'lowered' || tags.kerb === 'flush') return true;
  if (tags.kerb === 'raised') return false;
  const cc = tags.curb ?? tags['kerb:height'];
  if (cc) return true;
  return null;
}
function parseTactile(tags) {
  if (tags.tactile_paving === 'yes') return true;
  if (tags.tactile_paving === 'no')  return false;
  return null;
}
function parseIncline(tags) {
  const v = tags.incline;
  if (!v) return null;
  if (v === 'up') return 5;
  if (v === 'down') return -5;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// ── DEM elevation (AWS Terrarium tiles, cached per tile) ──────────────────────
const ZOOM = 14;
const tileCache = new Map(); // "z/x/y" → PNG pixel data (decoded)

function latLngToTile(lat, lng, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lng + 180) / 360 * n);
  const sinLat = Math.sin(lat * Math.PI / 180);
  const y = Math.floor((0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n);
  return { x, y, z: zoom };
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
  return R * 256 + G + B / 256 - 32768; // Terrarium formula
}

// ── Haversine distance (meters) ────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Main ───────────────────────────────────────────────────────────────────────
console.log(`Fetching OSM ways + nodes within ${RADIUS_M}m of (${CENTER_LAT}, ${CENTER_LNG})...`);

// Overpass: get ways (with node lists) + all referenced nodes (with coords).
// `out body` on ways gives us the node-ID array. `>;` recurses to nodes. `out skel qt` gives lat/lon.
const query = `
[out:json][timeout:120];
(
  way["highway"~"${HIGHWAY_FILTER}"](around:${RADIUS_M},${CENTER_LAT},${CENTER_LNG});
);
out body;
>;
out skel qt;
`;
const data = await fetchOverpass(query);
console.log(`  Got ${data.elements.length} elements from Overpass`);

// Separate nodes and ways
const nodeMap = new Map();   // nodeId → {lat, lng}
const wayList  = [];          // [{id, tags, nodeIds: []}]
for (const el of data.elements) {
  if (el.type === 'node') {
    nodeMap.set(el.id, { lat: el.lat, lng: el.lon });
  } else if (el.type === 'way' && el.nodes?.length >= 2) {
    wayList.push({ id: el.id, tags: el.tags ?? {}, nodeIds: el.nodes });
  }
}
console.log(`  ${wayList.length} ways, ${nodeMap.size} nodes`);

// Build nodeWayCount: how many ways each node belongs to
const nodeWayCount = new Map();  // nodeId → count of ways it appears in
for (const way of wayList) {
  for (const nid of way.nodeIds) {
    nodeWayCount.set(nid, (nodeWayCount.get(nid) ?? 0) + 1);
  }
}

// An "intersection node" is:
//   1. Appears in 2+ ways (junction), OR
//   2. Is the first or last node of any way (endpoint)
const intersectionNodes = new Set();
for (const way of wayList) {
  if (way.nodeIds.length > 0) {
    intersectionNodes.add(way.nodeIds[0]);
    intersectionNodes.add(way.nodeIds[way.nodeIds.length - 1]);
  }
  for (const nid of way.nodeIds) {
    if ((nodeWayCount.get(nid) ?? 0) >= 2) {
      intersectionNodes.add(nid);
    }
  }
}
console.log(`  ${intersectionNodes.size} intersection nodes`);

// Split each way at intersection nodes → produce sub-segments
const segments = [];
let skippedNodes = 0;

for (const way of wayList) {
  const { tags, nodeIds } = way;
  let segStart = 0;

  for (let i = 1; i < nodeIds.length; i++) {
    const isLastNode = i === nodeIds.length - 1;
    const isIntersection = intersectionNodes.has(nodeIds[i]);

    if (isIntersection || isLastNode) {
      // Sub-segment from nodeIds[segStart] to nodeIds[i]
      const subNodeIds = nodeIds.slice(segStart, i + 1);
      if (subNodeIds.length < 2) { segStart = i; continue; }

      const coords = [];
      let allFound = true;
      for (const nid of subNodeIds) {
        const nd = nodeMap.get(nid);
        if (!nd) { skippedNodes++; allFound = false; break; }
        coords.push([nd.lng, nd.lat]);
      }
      if (!allFound || coords.length < 2) { segStart = i; continue; }

      segments.push({
        osmId: way.id,
        street_name: tags.name ?? tags['addr:street'] ?? '',
        coords,                          // [[lng,lat], ...]
        path_type: tags.highway ?? null,
        surface_type: parseSurface(tags),
        smoothness: parseSmoothness(tags),
        sidewalk_width_m: parseWidth(tags),
        lit: parseLit(tags),
        is_step_free: parseStepFree(tags),
        has_curb_cuts: parseCurbCuts(tags),
        has_tactile_paving: parseTactile(tags),
        incline_percent: parseIncline(tags),
        is_obstacle_free: null,
        field_sources: JSON.stringify({ osm: Object.keys(tags) }),
      });

      segStart = i;
    }
  }
}
console.log(`  ${segments.length} sub-segments after splitting (skipped nodes: ${skippedNodes})`);

// ── DEM incline fill ───────────────────────────────────────────────────────────
// For segments that have no OSM incline tag, compute it from elevation difference.
// Tiles are cached so only ~9 unique tiles are fetched for a 3km area.
{
  const needsDem = segments.filter(s => s.incline_percent === null);
  console.log(`\nFetching DEM elevation for ${needsDem.length} segments (${tileCache.size} tiles cached so far)...`);
  let demFilled = 0, demFailed = 0;
  const CONCURRENCY = 8;
  for (let i = 0; i < needsDem.length; i += CONCURRENCY) {
    const chunk = needsDem.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async s => {
      const [startLng, startLat] = s.coords[0];
      const [endLng, endLat]     = s.coords[s.coords.length - 1];
      const [elevStart, elevEnd] = await Promise.all([
        getElevation(startLat, startLng),
        getElevation(endLat, endLng),
      ]);
      if (elevStart !== null && elevEnd !== null) {
        const lenM = haversine(startLat, startLng, endLat, endLng);
        if (lenM > 1) {
          s.incline_percent = Math.round(((elevEnd - elevStart) / lenM) * 100 * 10) / 10;
        }
        demFilled++;
      } else {
        demFailed++;
      }
    }));
    if ((i / CONCURRENCY) % 50 === 0) {
      process.stdout.write(`  DEM: ${i + chunk.length}/${needsDem.length} (tiles cached: ${tileCache.size})\r`);
    }
  }
  console.log(`\n  DEM filled: ${demFilled}, failed: ${demFailed}, tiles fetched: ${tileCache.size}`);
}

if (DRY_RUN) {
  console.log('\n[DRY RUN] Would insert', segments.length, 'segments. Pass --apply to execute.');
  // Sample output
  console.log('\nFirst 3 segments:');
  for (const s of segments.slice(0, 3)) {
    const len = haversine(s.coords[0][1], s.coords[0][0], s.coords[s.coords.length-1][1], s.coords[s.coords.length-1][0]);
    console.log(`  way=${s.osmId} nodes=${s.coords.length} len~${Math.round(len)}m surface=${s.surface_type} step_free=${s.is_step_free}`);
  }
  process.exit(0);
}

// ── DB import ──────────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  // osm_way_id is no longer unique: one OSM way splits into multiple sub-segments.
  // The original schema had a unique INDEX (not constraint), so we drop the index.
  await client.query(`DROP INDEX IF EXISTS street_segments_osm_way_id_uniq`);

  console.log('\nTRUNCATING street_segments...');
  await client.query('TRUNCATE street_segments RESTART IDENTITY CASCADE');

  console.log(`Inserting ${segments.length} segments...`);
  let inserted = 0;
  const BATCH = 200;

  for (let i = 0; i < segments.length; i += BATCH) {
    const batch = segments.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let p = 1;

    for (const s of batch) {
      const wkt = `ST_GeomFromText('LINESTRING(${s.coords.map(c => `${c[0]} ${c[1]}`).join(',')})', 4326)`;
      values.push(`(${wkt}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}::jsonb)`);
      params.push(
        s.osmId, s.street_name, s.path_type,
        s.surface_type, s.smoothness, s.sidewalk_width_m,
        s.incline_percent, s.is_step_free, s.lit,
        s.has_curb_cuts, s.has_tactile_paving, s.is_obstacle_free,
        s.field_sources
      );
    }

    await client.query(`
      INSERT INTO street_segments
        (geom, osm_way_id, street_name, path_type,
         surface_type, smoothness, sidewalk_width_m, incline_percent,
         is_step_free, lit, has_curb_cuts, has_tactile_paving, is_obstacle_free,
         field_sources)
      VALUES ${values.join(',')}
    `, params);
    inserted += batch.length;
    if (inserted % 1000 === 0 || inserted === segments.length) {
      process.stdout.write(`  ${inserted}/${segments.length}\r`);
    }
  }
  console.log(`\n✓ Inserted ${inserted} segments`);

  console.log('\nBuilding pgRouting topology (pgr_createTopology)...');
  await client.query(`SET statement_timeout = '300s'`);
  await client.query(`SELECT pgr_createTopology('street_segments', 0.000001, 'geom', 'seg_id')`);
  console.log('✓ Topology built');

  // Verify connectivity
  const compCount = await client.query(`
    SELECT count(DISTINCT component) as components,
           max(cnt) as nodes_in_biggest
    FROM (
      SELECT component, count(*) as cnt
      FROM (SELECT (pgr_connectedComponents(
        'SELECT seg_id::bigint AS id, source, target, 1.0 AS cost, 1.0 AS reverse_cost
         FROM street_segments WHERE source IS NOT NULL AND target IS NOT NULL'
      )).*) t
      GROUP BY component
    ) x
  `);
  console.log('Connectivity after import:', compCount.rows[0]);

  // ── Enrich from pathways.geojson ───────────────────────────────────────────
  console.log('\nEnriching from pathways.geojson...');
  const gjPath = path.resolve(__dirname, '../../data/pathways.geojson');
  let gwData;
  try {
    gwData = JSON.parse(await readFile(gjPath, 'utf8'));
  } catch {
    console.log('  pathways.geojson not found, skipping');
    gwData = null;
  }

  if (gwData) {
    const FIELD_MATCHERS = [
      { field: 'surface_type',    rx: /surface|покриття/i,   extract: v => v },
      { field: 'is_step_free',    rx: /step.free|без.*сходин/i, extract: v => v?.toLowerCase() === 'yes' || v === 'true' ? true : v?.toLowerCase() === 'no' || v === 'false' ? false : null },
      { field: 'has_curb_cuts',   rx: /curb|бордюр/i,        extract: v => v?.toLowerCase() === 'yes' ? true : v?.toLowerCase() === 'no' ? false : null },
      { field: 'has_tactile_paving', rx: /tactile|тактиль/i, extract: v => v?.toLowerCase() === 'yes' ? true : v?.toLowerCase() === 'no' ? false : null },
      { field: 'sidewalk_width_m',rx: /width|ширина/i,        extract: v => parseFloat(v) || null },
      { field: 'lit',             rx: /lit|освіт/i,           extract: v => v?.toLowerCase() === 'yes' ? true : v?.toLowerCase() === 'no' ? false : null },
    ];

    let enriched = 0;
    for (const feat of gwData.features ?? []) {
      if (!feat.geometry) continue;
      const geomWkt = feat.geometry.type === 'LineString'
        ? `ST_GeomFromText('LINESTRING(${feat.geometry.coordinates.map(c=>`${c[0]} ${c[1]}`).join(',')})', 4326)`
        : null;
      if (!geomWkt) continue;

      const updates = {};
      const props = feat.properties ?? {};
      for (const m of FIELD_MATCHERS) {
        for (const [k, v] of Object.entries(props)) {
          if (m.rx.test(k) && v != null) {
            const val = m.extract(String(v));
            if (val !== null) updates[m.field] = val;
          }
        }
      }
      if (Object.keys(updates).length === 0) continue;

      const setClauses = Object.keys(updates).map((f, i) => `${f} = $${i+1}`).join(', ');
      const vals = Object.values(updates);
      await client.query(`
        UPDATE street_segments
        SET ${setClauses}
        WHERE ST_DWithin(geom, ${geomWkt}, 0.0002)
          AND ST_Length(ST_Intersection(geom, ST_Buffer(${geomWkt}, 0.0001))::geography) > 5
      `, vals).catch(() => {}); // ignore errors on individual features
      enriched++;
    }
    console.log(`  Enriched from ${enriched} gov features`);
  }

  // ── Rebuild main_component_nodes ──────────────────────────────────────────
  console.log('\nRebuilding main_component_nodes (largest connected component)...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS main_component_nodes (node bigint PRIMARY KEY)
  `);
  await client.query(`TRUNCATE main_component_nodes`);
  await client.query(`
    INSERT INTO main_component_nodes (node)
    SELECT node
    FROM pgr_connectedComponents(
      'SELECT seg_id::bigint AS id, source, target, 1.0 AS cost, 1.0 AS reverse_cost
       FROM street_segments WHERE source IS NOT NULL AND target IS NOT NULL'
    )
    WHERE component = (
      SELECT component
      FROM pgr_connectedComponents(
        'SELECT seg_id::bigint AS id, source, target, 1.0 AS cost, 1.0 AS reverse_cost
         FROM street_segments WHERE source IS NOT NULL AND target IS NOT NULL'
      )
      GROUP BY component ORDER BY count(*) DESC LIMIT 1
    )
  `);
  const mcn = await client.query('SELECT count(*) FROM main_component_nodes');
  console.log(`✓ main_component_nodes: ${mcn.rows[0].count} nodes`);

  console.log('\n✓ Import complete.');
  console.log('  Segments:', (await client.query('SELECT count(*) FROM street_segments')).rows[0].count);
  console.log('  Vertices:', (await client.query('SELECT count(*) FROM street_segments_vertices_pgr')).rows[0].count);

  // path_type breakdown
  const ptypes = await client.query(`SELECT path_type, count(*) FROM street_segments GROUP BY path_type ORDER BY count(*) DESC`);
  console.log('\npath_type breakdown:');
  for (const r of ptypes.rows) console.log(`  ${(r.path_type ?? 'NULL').padEnd(20)} ${r.count}`);

} finally {
  await client.end();
}
