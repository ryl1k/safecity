// Tier 1: enrich street_segments with «Мапа безбар'єрності» government pathway
// assessments (data.gov.ua, Мінрозвитку + LUN; CC-BY). The gov dataset carries
// exactly the sidewalk-accessibility criteria OSM lacks (step-free, curb-cuts,
// tactile, ramp, width≥1.8m, even-surface, lighting) — but as POINTS, not lines.
// So we decode each pathway point's criteria → our entity fields and SNAP it to
// the nearest street_segment, filling only fields that are still NULL (never
// overwriting OSM/user values) and recording provenance in field_sources.'gov'.
//
//   node --env-file=.env tooling/importers/pathways-gov.mjs           # dry-run
//   node --env-file=.env tooling/importers/pathways-gov.mjs --apply   # write to DB
//   flags: --radius <m> (snap distance, default 35)  --data <dir>
//
// Source dataset id 546b7215-44f3-42eb-bf16-f74c9883a0b8, resource pathways.geojson.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RADIUS = Number(argVal('--radius') || 35);
const DATA_DIR = argVal('--data') || path.resolve('.bezbar-data');
function argVal(f) { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
const BASE = 'https://data.gov.ua/dataset/546b7215-44f3-42eb-bf16-f74c9883a0b8/resource';
const RESOURCES = {
  'pathways.geojson': '64ce1c8a-fe22-4db8-931d-09e8cfaf11c6',
};

// Direct criterion ID → entity field mapping.
// IDs derived from criteria.json; only sidewalk-relevant ones are listed.
const ID_TO_FIELD = new Map([
  // width ≥ 1.8 m
  ['0500284', 'width'],
  ['0600159', 'width'],
  ['6500802', 'width'],
  ['6900861', 'width'],
  ['7300890', 'width'],
  // curb cuts / dropped kerbs
  ['0500295', 'curb_cuts'],
  ['0600141', 'curb_cuts'],
  ['0600384', 'curb_cuts'],
  ['1100040', 'curb_cuts'],
  ['6500804', 'curb_cuts'],
  ['6900862', 'curb_cuts'],
  ['7000873', 'curb_cuts'],
  ['7300891', 'curb_cuts'],
  ['7300897', 'curb_cuts'],
  // obstacle-free path
  ['0600286', 'obstacle_free'],
  ['6600823', 'obstacle_free'],
  ['6900860', 'obstacle_free'],
  ['7300898', 'obstacle_free'],
  // step-free / ramp present
  ['6500806', 'step_free'],
  ['6600812', 'step_free'],
  ['6700825', 'step_free'],
  ['6900867', 'step_free'],
  // even / hard surface (smoothness)
  ['0600023', 'smoothness'],
  ['0600030', 'smoothness'],
  ['0600160', 'smoothness'],
  ['0600285', 'smoothness'],
  ['1500177', 'smoothness'],
  ['6500803', 'smoothness'],
  ['6900863', 'smoothness'],
  ['7300892', 'smoothness'],
  ['7300893', 'smoothness'],
  ['7600916', 'smoothness'],
  // tactile paving
  ['0100008', 'tactile'],
  ['0500296', 'tactile'],
  ['0500308', 'tactile'],
  ['0600143', 'tactile'],
  ['0600405', 'tactile'],
  ['0600474', 'tactile'],
  ['1100164', 'tactile'],
  ['6500809', 'tactile'],
  ['6600815', 'tactile'],
  ['6700828', 'tactile'],
  ['6700841', 'tactile'],
  ['6800851', 'tactile'],
  ['6900865', 'tactile'],
  ['6900866', 'tactile'],
  ['6900871', 'tactile'],
  ['7000874', 'tactile'],
  ['7300894', 'tactile'],
  ['7300895', 'tactile'],
  ['7300918', 'tactile'],
  ['7400903', 'tactile'],
  // ramp present
  ['0100043', 'ramp'],  // ramp start/end marked → ramp exists
  ['0500059', 'ramp'],
  ['0500185', 'ramp'],  // ramp start/end marked → ramp exists
  ['0500375', 'ramp'],
  ['0500509', 'ramp'],
  ['0600241', 'ramp'],
  ['0600476', 'ramp'],  // ramp start/end marked → ramp exists
  ['3700395', 'ramp'],
  ['3700399', 'ramp'],
  ['6500807', 'ramp'],
  ['6600813', 'ramp'],
  ['6700826', 'ramp'],
  ['6900864', 'ramp'],  // ramp provided when slope > 5%
  ['6900868', 'ramp'],  // single steps replaced by ramps
  ['6900869', 'ramp'],  // ramp slope spec → ramp exists
  ['7100877', 'ramp'],  // equipped with ramps/lifts
  ['7100878', 'ramp'],
  ['7400899', 'ramp'],
  ['7400901', 'ramp'],  // single steps replaced by ramps
  ['7400919', 'ramp'],  // ramp slope spec → ramp exists
  // lit
  ['0500166', 'lit'],
  ['0700053', 'lit'],
  ['6500805', 'lit'],
  ['7000876', 'lit'],
]);

const norm = (s) => (s || '').toLowerCase().replace(/[ʼ']/g, "'").replace(/\s+/g, ' ').trim();
const VAL = { 'так': 'yes', 'ні': 'no' };

// entity field → { column, sourceKey }
const FIELD_COL = {
  width:         { col: 'sidewalk_width_m',   key: 'width' },
  smoothness:    { col: 'smoothness',         key: 'smoothness' },
  obstacle_free: { col: 'is_obstacle_free',   key: 'obstacle_free' },
  step_free:     { col: 'is_step_free',       key: 'step_free' },
  curb_cuts:     { col: 'has_curb_cuts',      key: 'curb_cuts' },
  tactile:       { col: 'has_tactile_paving', key: 'tactile' },
  ramp:          { col: 'has_ramp',           key: 'ramp' },
  lit:           { col: 'lit',                key: 'lit' },
};

async function ensureFile(name) {
  const dest = path.join(DATA_DIR, name);
  try { await access(dest); return dest; } catch { /* download */ }
  const url = `${BASE}/${RESOURCES[name]}/download/${name.toLowerCase()}`;
  process.stdout.write(`  downloading ${name} … `);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
  return dest;
}

// Decode one pathway feature's criteria → { db_column: value }.
function decodeFields(props) {
  const acc = {}; // field -> ['yes'|'no', ...]
  for (const cat of props.categories || []) {
    for (const cr of cat.criteria || []) {
      const val = VAL[norm(cr.value)];
      if (!val) continue;
      const field = ID_TO_FIELD.get(String(cr.id));
      if (!field) continue;
      (acc[field] ||= []).push(val);
    }
  }
  const out = {};
  if (acc.width        && acc.width.includes('yes'))          out.sidewalk_width_m   = 1.8;
  if (acc.smoothness)                                          out.smoothness         = acc.smoothness.includes('no') ? 'intermediate' : 'good';
  if (acc.step_free)                                           out.is_step_free       = !acc.step_free.includes('no');
  if (acc.obstacle_free)                                       out.is_obstacle_free   = !acc.obstacle_free.includes('no');
  if (acc.curb_cuts)                                           out.has_curb_cuts      = acc.curb_cuts.includes('yes');
  if (acc.tactile)                                             out.has_tactile_paving = acc.tactile.includes('yes');
  if (acc.ramp)                                                out.has_ramp           = acc.ramp.includes('yes');
  if (acc.lit)                                                 out.lit                = acc.lit.includes('yes');
  return out;
}

const COL_KEY = Object.fromEntries(Object.values(FIELD_COL).map((v) => [v.col, v.key]));

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  console.log(`Mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY-RUN'} · snap radius ${RADIUS} m · data ${DATA_DIR}\n`);

  const fc = JSON.parse(await readFile(await ensureFile('pathways.geojson'), 'utf8'));
  const feats = fc.features || [];
  console.log(`Pathway points: ${feats.length}`);

  let sql = null;
  if (APPLY) {
    const { default: postgres } = await import('postgres');
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set (run with --env-file=.env)');
    sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });
  }

  const stat = { decoded: 0, snapped: 0, noSegment: 0, nothingNew: 0, fieldsWritten: {}, samples: [] };
  const bump = (k) => (stat.fieldsWritten[k] = (stat.fieldsWritten[k] || 0) + 1);

  const decoded = [];
  for (const f of feats) {
    const p = f.properties || {};
    const lng = Number(p.lon), lat = Number(p.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const fields = decodeFields(p);
    if (Object.keys(fields).length === 0) continue;
    stat.decoded++;
    if (stat.samples.length < 8) stat.samples.push({ street: p.addressThoroughfare || p.title || '?', fields });
    decoded.push({ lng, lat, fields });
  }

  if (APPLY) {
    const CHUNK = 200;
    const total = Math.ceil(decoded.length / CHUNK);
    for (let ci = 0; ci < decoded.length; ci += CHUNK) {
      const chunk = decoded.slice(ci, ci + CHUNK);
      const idxs = chunk.map((_, j) => j);
      const lngs = chunk.map((p) => p.lng);
      const lats = chunk.map((p) => p.lat);

      const rows = await sql`
        select pts.i, s.id, s.smoothness, s.sidewalk_width_m, s.is_step_free,
               s.has_curb_cuts, s.has_tactile_paving, s.has_ramp, s.lit, s.is_obstacle_free
        from unnest(${idxs}::int[], ${lngs}::float8[], ${lats}::float8[]) as pts(i, lng, lat)
        cross join lateral (
          select id, smoothness, sidewalk_width_m, is_step_free, has_curb_cuts,
                 has_tactile_paving, has_ramp, lit, is_obstacle_free
          from street_segments
          where ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(pts.lng, pts.lat), 4326)::geography, ${RADIUS})
          order by geom::geography <-> ST_SetSRID(ST_MakePoint(pts.lng, pts.lat), 4326)::geography
          limit 1
        ) s`;

      stat.noSegment += chunk.length - rows.length;

      for (const row of rows) {
        const { i, id, ...seg } = row;
        const { fields } = chunk[i];
        const set = {}, src = {};
        for (const [col, val] of Object.entries(fields)) {
          if (seg[col] === null || seg[col] === undefined) { set[col] = val; src[COL_KEY[col]] = 'gov'; bump(COL_KEY[col]); }
        }
        if (Object.keys(set).length === 0) { stat.nothingNew++; continue; }
        await sql`update street_segments set ${sql(set)}, field_sources = field_sources || ${sql.json(src)}, updated_at = now() where id = ${id}`;
        stat.snapped++;
      }

      process.stdout.write(`\r  chunk ${Math.ceil((ci + chunk.length) / CHUNK)}/${total} · snapped ${stat.snapped}   `);
    }
    process.stdout.write('\n');
  }

  console.log('\n=== Sample decoded pathway points ===');
  for (const s of stat.samples) console.log(`• ${s.street}: ${JSON.stringify(s.fields)}`);
  console.log('\n=== Summary ===');
  console.log(`Points with mappable criteria: ${stat.decoded}`);
  if (APPLY) {
    console.log(`Snapped & enriched a segment: ${stat.snapped}`);
    console.log(`Matched a segment but nothing new to fill: ${stat.nothingNew}`);
    console.log(`No segment within ${RADIUS} m (dropped): ${stat.noSegment}`);
    console.log(`Fields written: ${JSON.stringify(stat.fieldsWritten)}`);
  } else {
    console.log('(DRY-RUN — re-run with --apply to write.)');
  }
  if (sql) await sql.end();
}

main().catch((e) => { console.error('pathways-gov failed:', e.message); process.exitCode = 1; });
