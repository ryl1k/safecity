// Full national seed from the "Мапа безбар'єрності" open dataset (data.gov.ua,
// Mindev + LUN; CC-BY). Supersedes bezbarrier.mjs's showcase import: this reads
// the locally-downloaded per-category GeoJSON, maps each monitored object onto an
// enriched SafeCity Point, and seeds ALL of them nationwide.
//
// Enriched fields carried onto each point (migration 0024):
//   gov_rating       real   — the dataset's own 0..1 barrier-free monitoring score
//   rating_authority text   — who assessed it (e.g. міськрада; "невідомо" when unknown)
//   kind             text   — the specific gov subtype (Аптеки, Медицина, Вокзали, …)
//   source_url       text   — the lun.ua barrier-free page for provenance
//   checked_on       date   — the dataset's updateDate
// plus the existing wheelchair feature checklist (point_feature_values, via matchers).
//
//   node --env-file=.env tooling/importers/bezbar-diya.mjs                 # dry-run: 5 diverse samples
//   node --env-file=.env tooling/importers/bezbar-diya.mjs --sample 8      # dry-run: N samples
//   node --env-file=.env tooling/importers/bezbar-diya.mjs --city Львів --apply
//   node --env-file=.env tooling/importers/bezbar-diya.mjs --national --wipe --apply
//   flags: --data <dir>  --only <file.geojson>  --oblast "<oblast>"
//
// Files are large (constructions.geojson ≈ 352 MB) so features are streamed one at
// a time — never JSON.parse'd whole — and written to the DB in batched unnest upserts.
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const WIPE = args.includes('--wipe');
const NATIONAL = args.includes('--national');
const DATA_DIR = argVal('--data') || path.resolve('.bezbar-data/datasets-diya');
const ONLY = argVal('--only');
const CITY = argVal('--city');
const OBLAST = argVal('--oblast');
const SAMPLE = args.includes('--sample') || (!APPLY && !CITY && !OBLAST && !NATIONAL);
const SAMPLE_N = Number(argVal('--sample')) || 5;
const BATCH = 1000;

function argVal(flag) {
  const i = args.indexOf(flag);
  const v = i >= 0 ? args[i + 1] : null;
  return v && !v.startsWith('--') ? v : null;
}

// file -> our category enum. Everything is a "venue" place except rail/bus stations.
const TARGETS = [
  ['establishments.geojson', 'venue'],
  ['hotels.geojson', 'venue'],
  ['objects.geojson', 'venue'],
  ['others.geojson', 'venue'],
  ['constructions.geojson', 'venue'],
  ['infrastructure.geojson', 'transit'],
];

// Which SafeCity categories each feature key is valid for (from the catalog).
const KEY_CATS = {
  step_free_entrance: ['venue'], ramp: ['venue'], ramp_slope_ok: ['venue'], door_width: ['venue'],
  elevator: ['venue'], accessible_toilet: ['venue'], level_interior: ['venue'], accessible_parking_near: ['venue'],
  tactile_guidance_entrance: ['venue'], braille_signage: ['venue'], staff_assistance: ['venue'],
  good_lighting: ['venue'], guide_dog_welcome: ['venue'],
  level_boarding: ['transit'], step_free_to_stop: ['transit'], low_floor_vehicles: ['transit'],
  tactile_paving: ['transit'], audio_announcements: ['transit'], high_contrast_edge: ['transit'],
};

// Criterion-title → feature key(s). Matched on a normalised lowercase title. The
// dataset mixes SHORT criteria (hotels/stops) and LONG official ДБН criteria for the
// same concept, so patterns cover both wordings. (Ported from bezbarrier.mjs.)
const MATCHERS = [
  { re: /уклон пандуса.*не більше ніж 8 відсотків|пандус.*кут від 3 до 5 градус/, keys: ['ramp', 'ramp_slope_ok'] },
  { re: /^пандус при вході$|відсутні сходи або наявні сходи і пандус/, keys: ['ramp'] },
  { re: /вхід.*безперешкодн|вхід.*врівень з землею|вхідні двері не мають порог|на вході відсутні сходи|відсутні пороги, а за наявності|перепади висоти підлоги на вході/, keys: ['step_free_entrance'] },
  { re: /вхідні двері шириною не менше 0,9|ширина дверних отворів.*не менше ніж 0,9|ширина дверей.*не менше ніж 0,9/, keys: ['door_width'] },
  { re: /^ліфт\b|^є підйомник/, keys: ['elevator'] },
  { re: /вбиральня для людей з інвалідніст|універсальна вбиральн|доступна вбиральн|універсальну кабіну/, keys: ['accessible_toilet'] },
  { re: /двері всередині будівлі не мають порог/, keys: ['level_interior'] },
  { re: /паркувальні місця для (авто )?(осіб|людей) з інвалідніст/, keys: ['accessible_parking_near'] },
  { re: /шрифтом брайл/, keys: ['braille_signage'] },
  { re: /попереджувальна тактильна смуга|тактильне контрастне маркуванн/, keys: ['tactile_guidance_entrance', 'tactile_paving'] },
  { re: /освітлення входу|штучне освітлення шляхів руху|освітлення шляхів руху/, keys: ['good_lighting'] },
  { re: /собакою-поводир|дружн.*тварин/, keys: ['guide_dog_welcome'] },
  { re: /звуков.*супровід|голосов.*повідомл/, keys: ['audio_announcements'] },
  { re: /вбудований.*звуков|аудіо.*оголош/, keys: ['audio_announcements'] },
];

const FEATURE_LABELS = {
  step_free_entrance: 'вхід без сходів', ramp: 'пандус', ramp_slope_ok: 'пологий пандус', door_width: 'широкий вхід',
  elevator: 'ліфт', accessible_toilet: 'доступний туалет', level_interior: 'рівна підлога',
  accessible_parking_near: 'паркування для людей з інвалідністю', tactile_guidance_entrance: 'тактильна навігація',
  braille_signage: 'шрифт Брайля', staff_assistance: 'допомога персоналу', good_lighting: 'добре освітлення',
  guide_dog_welcome: 'із собакою-поводирем', level_boarding: 'посадка врівень', step_free_to_stop: 'підхід без сходів',
  low_floor_vehicles: 'низькопідлоговий транспорт', tactile_paving: 'тактильна плитка', audio_announcements: 'аудіооголошення',
  high_contrast_edge: 'контрастний край',
};

const norm = (s) => (s || '').toLowerCase().replace(/[ʼ’]/g, "'").trim();
const VAL = { так: 'yes', ні: 'no', 'не застосовується': null };

// ── Streaming GeoJSON reader ────────────────────────────────────────────────
// Yields each feature of a FeatureCollection without loading the whole file,
// by tracking brace depth once we've passed the "features" key.
function* streamFeatures(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1 << 20);
  const BACKSLASH = String.fromCharCode(92);
  let seenFeatures = false, started = false, depth = 0, cur = '', inStr = false, esc = false, pre = '';
  try {
    while (true) {
      const bytes = fs.readSync(fd, buf, 0, buf.length, null);
      if (bytes === 0) break;
      const chunk = buf.toString('utf8', 0, bytes);
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i];
        if (!seenFeatures) {
          pre += c;
          if (pre.length > 4096) pre = pre.slice(-64);
          if (pre.includes('"features"')) { seenFeatures = true; pre = ''; }
          continue;
        }
        if (!started) {
          if (c === '{') { started = true; depth = 1; cur = '{'; inStr = false; esc = false; }
          continue;
        }
        cur += c;
        if (inStr) {
          if (esc) esc = false;
          else if (c === BACKSLASH) esc = true;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            let feat;
            try { feat = JSON.parse(cur); } catch { feat = null; }
            if (feat) yield feat;
            started = false; cur = '';
          }
        }
      }
    }
  } finally {
    fs.closeSync(fd);
  }
}

// ── Mapping ─────────────────────────────────────────────────────────────────
function mapFeatures(props, category, idTitle) {
  const out = {};
  const set = (key, val) => {
    if (!val) return;
    if (!(KEY_CATS[key] || []).includes(category)) return;
    if (out[key] === 'yes') return; // yes wins over no
    out[key] = val;
  };
  for (const cat of props.categories || []) {
    for (const cr of cat.criteria || []) {
      const title = idTitle.get(cr.id);
      if (!title) continue;
      const val = VAL[norm(cr.value)];
      const t = norm(title);
      for (const m of MATCHERS) if (m.re.test(t)) for (const k of m.keys) set(k, val);
    }
  }
  return out;
}

function preparePoint(p, category, idTitle) {
  const lng = Number(p.lon), lat = Number(p.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const features = mapFeatures(p, category, idTitle);
  const name = (p.title || '').trim() || 'Без назви';
  const address = [p.addressThoroughfare, p.addressPostName].filter(Boolean).join(', ') || null;
  const kind = (p.kind || '').trim() || null;
  const authority = (p.ratingAuthority || '').trim() || null;
  const govRating = Number.isFinite(p.rating) ? p.rating : null;
  const url = (p.url || '').trim() || null;
  const checkedOn = /^\d{4}-\d{2}-\d{2}$/.test(p.updateDate || '') ? p.updateDate : null;

  const present = Object.entries(features)
    .filter(([, v]) => v === 'yes')
    .map(([k]) => FEATURE_LABELS[k])
    .filter(Boolean);
  const a11y = present.length ? `Зручності для крісла колісного: ${present.slice(0, 6).join(', ')}.` : '';
  const note = (p.notes || '').trim();
  const description = [kind ? `${kind}.` : '', a11y, note].filter(Boolean).join(' ') || null;

  return {
    osmId: `bezbar/${p.id}`, name, category, lng, lat, address, description,
    govRating, authority, kind, url, checkedOn, features,
    city: p.addressPostName, oblast: p.addressAdminUnitL2,
  };
}

function inScope(p) {
  if (NATIONAL) return true;
  if (CITY) return norm(p.city) === norm(CITY);
  if (OBLAST) return norm(p.oblast) === norm(OBLAST);
  return true; // sample mode: no geo filter
}

// ── DB batch upsert (unnest — one round-trip per BATCH points) ───────────────
async function flushBatch(sql, batch) {
  if (!batch.length) return 0;
  const rows = await sql`
    insert into points
      (name, category, geom, address, description, source, verify_status, osm_id,
       gov_rating, rating_authority, kind, source_url, checked_on)
    select x.name, x.category::point_category,
           ST_SetSRID(ST_MakePoint(x.lng, x.lat), 4326)::geography,
           x.address, x.description, 'imported', 'unverified', x.osm_id,
           x.gov_rating, x.rating_authority, x.kind, x.source_url, x.checked_on::date
    from unnest(
      ${sql.array(batch.map((b) => b.name))}::text[],
      ${sql.array(batch.map((b) => b.category))}::text[],
      ${sql.array(batch.map((b) => b.lng))}::float8[],
      ${sql.array(batch.map((b) => b.lat))}::float8[],
      ${sql.array(batch.map((b) => b.address))}::text[],
      ${sql.array(batch.map((b) => b.description))}::text[],
      ${sql.array(batch.map((b) => b.osmId))}::text[],
      ${sql.array(batch.map((b) => b.govRating))}::float8[],
      ${sql.array(batch.map((b) => b.authority))}::text[],
      ${sql.array(batch.map((b) => b.kind))}::text[],
      ${sql.array(batch.map((b) => b.url))}::text[],
      ${sql.array(batch.map((b) => b.checkedOn))}::text[]
    ) as x(name, category, lng, lat, address, description, osm_id,
           gov_rating, rating_authority, kind, source_url, checked_on)
    on conflict (osm_id) where osm_id is not null
    do update set name = excluded.name, geom = excluded.geom, category = excluded.category,
                  address = coalesce(excluded.address, points.address),
                  description = excluded.description, gov_rating = excluded.gov_rating,
                  rating_authority = excluded.rating_authority, kind = excluded.kind,
                  source_url = excluded.source_url, checked_on = excluded.checked_on,
                  updated_at = now()
    returning id, osm_id`;

  const idByOsm = new Map(rows.map((r) => [r.osm_id, r.id]));
  const pids = [], keys = [], vals = [];
  for (const b of batch) {
    const id = idByOsm.get(b.osmId);
    if (!id) continue;
    for (const [k, v] of Object.entries(b.features)) { pids.push(id); keys.push(k); vals.push(v); }
  }
  if (pids.length) {
    await sql`
      insert into point_feature_values (point_id, feature_key, value)
      select p, k, v::feature_value from unnest(
        ${sql.array(pids)}::uuid[], ${sql.array(keys)}::text[], ${sql.array(vals)}::text[]
      ) as t(p, k, v)
      on conflict (point_id, feature_key) do update set value = excluded.value`;
  }
  return rows.length;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const scope = NATIONAL ? 'ALL (national)' : CITY ? `city=${CITY}` : OBLAST ? `oblast=${OBLAST}` : 'sample';
  console.log(`Mode: ${SAMPLE ? 'DRY-RUN sample' : APPLY ? 'APPLY (writing)' : 'DRY-RUN'} · scope: ${scope} · data: ${DATA_DIR}\n`);

  const criteria = JSON.parse(await readFile(path.join(DATA_DIR, 'criteria.json'), 'utf8'));
  const idTitle = new Map(criteria.map((c) => [c.id, c.title]));

  let sql = null;
  if (APPLY) {
    const { default: postgres } = await import('postgres');
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set (run with --env-file=.env)');
    sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });
    if (WIPE) {
      // A problem attached to a point with no geom of its own would violate
      // problems_check (point_id is not null OR geom is not null) the moment the
      // ON DELETE SET NULL cascade nulls its point_id. Backfill geom from the
      // point first so the civic report survives the wipe.
      await sql`update problems p set geom = pt.geom
                from points pt where p.point_id = pt.id and p.geom is null`;
      const [{ n }] = await sql`select count(*)::int n from points`;
      await sql`delete from points`;
      console.log(`WIPED ${n} existing points (street_segments untouched).\n`);
    }
  }

  const targets = ONLY ? TARGETS.filter(([f]) => f === ONLY) : TARGETS;
  const totals = { seen: 0, scoped: 0, withFeatures: 0, upserts: 0 };
  const samples = [];

  for (const [file, category] of targets) {
    const full = path.join(DATA_DIR, file);
    if (!fs.existsSync(full)) { console.log(`  (skip ${file} — not found)`); continue; }
    let scoped = 0, withFeat = 0, batch = [];

    for (const f of streamFeatures(full)) {
      totals.seen++;
      const pt = preparePoint(f.properties || {}, category, idTitle);
      if (!pt || !inScope(pt)) continue;
      scoped++;
      const nKeys = Object.keys(pt.features).length;
      if (nKeys) withFeat++;

      // sample mode: take the first "rich" point of this file (has a gov score
      // + a mapped amenity), then stop reading it — a diverse per-file preview.
      if (SAMPLE) {
        if (pt.govRating != null && nKeys >= 1) { samples.push(pt); break; }
        continue;
      }

      if (APPLY) {
        batch.push(pt);
        if (batch.length >= BATCH) { totals.upserts += await flushBatch(sql, batch); batch = []; process.stdout.write(`\r  ${file.padEnd(24)} upserted ${totals.upserts}   `); }
      }
    }
    if (APPLY && batch.length) { totals.upserts += await flushBatch(sql, batch); }
    totals.scoped += scoped; totals.withFeatures += withFeat;
    if (!SAMPLE) console.log(`\r  ${file.padEnd(24)} scoped ${String(scoped).padStart(6)} · with-features ${String(withFeat).padStart(6)}`);
  }

  if (SAMPLE) {
    console.log(`\n===== ${samples.length} SAMPLE POINTS (nothing written) =====\n`);
    for (const s of samples) {
      const pct = s.govRating != null ? `${Math.round(s.govRating * 100)}%` : '—';
      const yes = Object.entries(s.features).filter(([, v]) => v === 'yes').map(([k]) => FEATURE_LABELS[k] || k);
      const no = Object.entries(s.features).filter(([, v]) => v === 'no').map(([k]) => FEATURE_LABELS[k] || k);
      console.log(`• ${s.name}`);
      console.log(`    category      : ${s.category}   (kind: ${s.kind})`);
      console.log(`    address       : ${s.address || '—'}`);
      console.log(`    gov_rating    : ${pct}   (authority: ${s.authority || '—'})`);
      console.log(`    checked_on    : ${s.checkedOn || '—'}`);
      console.log(`    source_url    : ${s.url || '—'}`);
      console.log(`    ✓ present     : ${yes.length ? yes.join(', ') : '—'}`);
      console.log(`    ✗ absent      : ${no.length ? no.join(', ') : '—'}`);
      console.log(`    description   : ${s.description || '—'}`);
      console.log('');
    }
  } else {
    console.log('\n=== Summary ===');
    console.log(`Seen: ${totals.seen} · scoped: ${totals.scoped} · with ≥1 feature: ${totals.withFeatures}`);
    if (APPLY) console.log(`Upserted: ${totals.upserts} points`);
  }

  if (sql) await sql.end();
}

// process.exit (not exitCode) so a still-open pg connection can't keep the event
// loop alive and make a failed run look like a hang.
main().catch((e) => { console.error('\nbezbar-diya failed:', e.message); process.exit(1); });
