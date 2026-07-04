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
  'criteria.json': '94fc1df9-46ff-4967-84ca-f2818a176239',
};

const norm = (s) => (s || '').toLowerCase().replace(/[ʼ’]/g, "'").replace(/\s+/g, ' ').trim();
const VAL = { 'так': 'yes', 'ні': 'no' };

// Criterion-title → entity field (first match wins per criterion). Patterns cover
// both the modern ДБН wording (n≈2097 rows) and the older short LUN wording.
const FIELD_MATCHERS = [
  ['width',      /ширин[аи].{0,40}не менше ніж 1,?8|ширина тротуару не менше 1[.,]8/],
  ['curb_cuts',  /пониження борд|пониження борт|поєднані на одному (спільному )?рівні|пологі з.їзди/],
  ['step_free',  /відсутні сходи або наявні сходи і пандус|немає перепон|відсутні перешкоди|вільний (від|для).{0,40}перешкод|без будь-яких перешкод для пішохідного/],
  ['smoothness', /рівн[еий].{0,40}без вибоїн|тверде, ?несипуче/],
  ['tactile',    /тактильн.{0,30}(смуг|направляюч|маркуванн)|попереджувальн.{0,25}тактильн/],
  ['ramp',       /уклон пандуса|пандус на маршруті|сходинки замінені пандус|сходи.{0,25}продубльовано пандус|^пандус$/],
  ['lit',        /^освітленн|штучне освітлення|вуличне.{0,20}освітленн/],
];

// entity field → { column, sourceKey }
const FIELD_COL = {
  width:      { col: 'sidewalk_width_m',   key: 'width' },
  smoothness: { col: 'smoothness',         key: 'smoothness' },
  step_free:  { col: 'is_step_free',       key: 'step_free' },
  curb_cuts:  { col: 'has_curb_cuts',      key: 'curb_cuts' },
  tactile:    { col: 'has_tactile_paving', key: 'tactile' },
  ramp:       { col: 'has_ramp',           key: 'ramp' },
  lit:        { col: 'lit',                key: 'lit' },
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

// Decode one pathway feature's criteria → { column: value } for fields it asserts.
function decodeFields(props, idTitle) {
  const acc = {}; // field -> ['yes'|'no', ...]
  for (const cat of props.categories || []) {
    for (const cr of cat.criteria || []) {
      const val = VAL[norm(cr.value)];
      if (!val) continue; // skip N/A / blank
      const title = norm(idTitle.get(cr.id));
      if (!title) continue;
      for (const [field, re] of FIELD_MATCHERS) { if (re.test(title)) { (acc[field] ||= []).push(val); break; } }
    }
  }
  const out = {}; // column -> value
  if (acc.width && acc.width.includes('yes')) out.sidewalk_width_m = 1.8; // gov gives a ≥1.8m threshold, store the floor
  if (acc.smoothness) out.smoothness = acc.smoothness.includes('no') ? 'intermediate' : 'good'; // a reported defect dominates
  if (acc.step_free) out.is_step_free = !acc.step_free.includes('no'); // a reported step/barrier dominates
  if (acc.curb_cuts) out.has_curb_cuts = acc.curb_cuts.includes('yes'); // amenity presence
  if (acc.tactile) out.has_tactile_paving = acc.tactile.includes('yes');
  if (acc.ramp) out.has_ramp = acc.ramp.includes('yes');
  if (acc.lit) out.lit = acc.lit.includes('yes');
  return out;
}

const COL_KEY = Object.fromEntries(Object.values(FIELD_COL).map((v) => [v.col, v.key]));

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  console.log(`Mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY-RUN'} · snap radius ${RADIUS} m · data ${DATA_DIR}\n`);

  const crit = JSON.parse(await readFile(await ensureFile('criteria.json'), 'utf8'));
  const idTitle = new Map(crit.map((c) => [c.id, c.title]));
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

  for (const f of feats) {
    const p = f.properties || {};
    const lng = Number(p.lon), lat = Number(p.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const fields = decodeFields(p, idTitle);
    if (Object.keys(fields).length === 0) continue;
    stat.decoded++;
    if (stat.samples.length < 8) stat.samples.push({ street: p.addressThoroughfare || p.title || '?', fields });

    if (!APPLY) continue;

    const [seg] = await sql`
      select id, smoothness, sidewalk_width_m, is_step_free, has_curb_cuts, has_tactile_paving, has_ramp, lit
      from street_segments
      where ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${RADIUS})
      order by geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      limit 1`;
    if (!seg) { stat.noSegment++; continue; }

    const set = {}, src = {};
    for (const [col, val] of Object.entries(fields)) {
      if (seg[col] === null || seg[col] === undefined) { set[col] = val; src[COL_KEY[col]] = 'gov'; bump(COL_KEY[col]); }
    }
    if (Object.keys(set).length === 0) { stat.nothingNew++; continue; }
    await sql`update street_segments set ${sql(set)}, field_sources = field_sources || ${sql.json(src)}, updated_at = now() where id = ${seg.id}`;
    stat.snapped++;
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
