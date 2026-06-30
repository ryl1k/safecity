// National "Мапа безбар'єрності" importer (data.gov.ua, Mindev + LUN; CC-BY).
// Downloads the per-category GeoJSON, filters to Lviv, maps each object's
// accessibility criteria onto SafeCity feature keys (by criterion-title match,
// since the same human concept recurs across category-prefixed ids), and upserts
// them as imported Points (idempotent, keyed on osm_id = `bezbar/<id>`).
//
//   node --env-file=.env tooling/importers/bezbarrier.mjs            # dry-run (no DB writes)
//   node --env-file=.env tooling/importers/bezbarrier.mjs --apply    # write to DB
//   flags: --data <dir>  --oblast (whole Lviv oblast, default city bbox)  --only <file.geojson>
//
// Dataset: https://data.gov.ua/dataset/.../  id 38997a1f-2e86-4bd7-9054-cd9cd206d825
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const OBLAST = args.includes('--oblast');
const DATA_DIR = argVal('--data') || path.resolve('.bezbar-data');
const ONLY = argVal('--only');

function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const BASE = 'https://data.gov.ua/dataset/546b7215-44f3-42eb-bf16-f74c9883a0b8/resource';

// resource id + filename per source file, with the SafeCity category it maps to.
const RESOURCES = {
  'criteria.json': '94fc1df9-46ff-4967-84ca-f2818a176239',
  'establishments.geojson': 'f67b18b4-736a-4fd9-89ed-4b3fdfb59003',
  'hotels.geojson': '67931c7a-c3ab-4ff4-91a9-baa338b2f39c',
  'buildings.geojson': '5518eb11-590d-48f8-96ec-1f0c2d31a789',
  'objects.geojson': '0af97783-e8b3-4a23-8898-2ac92a320046',
  'stops.geojson': '4c85cfa8-7267-477b-9b35-c4bba17304ef',
  'infrastructure.geojson': '29a5b6db-66cc-4f3b-8e4e-b3dc27f11191',
};
// file -> our category enum
const TARGETS = [
  ['establishments.geojson', 'venue'],
  ['hotels.geojson', 'venue'],
  ['buildings.geojson', 'venue'],
  ['objects.geojson', 'venue'],
  ['stops.geojson', 'transit'],
  ['infrastructure.geojson', 'transit'],
];

// Lviv city bounding box (matches the mobile/web map extent).
const LVIV = { minLng: 23.9, minLat: 49.78, maxLng: 24.15, maxLat: 49.92 };

// Which SafeCity categories each feature key is valid for (from the catalog).
const KEY_CATS = {
  step_free_entrance: ['venue'], ramp: ['venue'], ramp_slope_ok: ['venue'], door_width: ['venue'],
  elevator: ['venue'], accessible_toilet: ['venue'], level_interior: ['venue'], accessible_parking_near: ['venue'],
  tactile_guidance_entrance: ['venue'], braille_signage: ['venue'], staff_assistance: ['venue'],
  good_lighting: ['venue'], guide_dog_welcome: ['venue'],
  level_boarding: ['transit'], step_free_to_stop: ['transit'], low_floor_vehicles: ['transit'],
  tactile_paving: ['transit'], audio_announcements: ['transit'], high_contrast_edge: ['transit'],
  dropped_curb: ['crossing'], acoustic_signal: ['crossing'],
  accessible_stall: ['toilet'], grab_bars: ['toilet'], turning_space: ['toilet'], emergency_cord: ['toilet'],
  disabled_bay: ['parking'], bay_width: ['parking'], near_entrance: ['parking'],
};

// Criterion-title → feature key(s). Matched on a normalised lowercase title.
// The dataset mixes SHORT criteria (hotels/stops) and LONG official ДБН criteria
// (establishments) for the same concept, so patterns cover both wordings.
const MATCHERS = [
  // ramp presence + slope
  { re: /уклон пандуса.*не більше ніж 8 відсотків|пандус.*кут від 3 до 5 градус/, keys: ['ramp', 'ramp_slope_ok'] },
  { re: /^пандус при вході$|відсутні сходи або наявні сходи і пандус/, keys: ['ramp'] },
  // step-free entrance (no steps / no thresholds at the door)
  { re: /вхід.*безперешкодн|вхід.*врівень з землею|вхідні двері не мають порог|на вході відсутні сходи|відсутні пороги, а за наявності|перепади висоти підлоги на вході/, keys: ['step_free_entrance'] },
  // door width ≥0.9 m
  { re: /вхідні двері шириною не менше 0,9|ширина дверних отворів.*не менше ніж 0,9|ширина дверей.*не менше ніж 0,9/, keys: ['door_width'] },
  // elevator — anchored so "вертикальні підйомники" inside the entrance criterion doesn't false-match
  { re: /^ліфт\b|^є підйомник/, keys: ['elevator'] },
  // accessible toilet / stall / turning space / grab bars / emergency cord
  { re: /вбиральня для людей з інвалідніст|універсальна вбиральн|доступна вбиральн|універсальну кабіну/, keys: ['accessible_toilet', 'accessible_stall'] },
  { re: /вільний простір для маневрування крісла колісного|місце для маневрування крісла колісного/, keys: ['turning_space'] },
  { re: /поручні з обох боків унітазу/, keys: ['grab_bars'] },
  { re: /аварійною \(тривожною\) сигналізацією/, keys: ['emergency_cord'] },
  // interior step-free
  { re: /двері всередині будівлі не мають порог/, keys: ['level_interior'] },
  // accessible parking (venue) / disabled bay (parking)
  { re: /паркувальні місця для (авто )?(осіб|людей) з інвалідніст/, keys: ['accessible_parking_near', 'disabled_bay'] },
  { re: /завширшки не менше ніж 3,5/, keys: ['bay_width'] },
  { re: /не більше ніж 50 метрів від входу/, keys: ['near_entrance'] },
  // blind profile
  { re: /шрифтом брайл/, keys: ['braille_signage'] },
  { re: /попереджувальна тактильна смуга|тактильне контрастне маркуванн/, keys: ['tactile_guidance_entrance', 'tactile_paving'] },
  { re: /освітлення входу|штучне освітлення шляхів руху|освітлення шляхів руху/, keys: ['good_lighting'] },
  { re: /собакою-поводир|дружн.*тварин/, keys: ['guide_dog_welcome'] },
  { re: /звуков.*супровід|голосов.*повідомл/, keys: ['audio_announcements'] },
  { re: /пониження бордюрного каменю/, keys: ['dropped_curb'] },
];

// Short UA labels for the mapped feature keys (used to compose readable descriptions).
const FEATURE_LABELS = {
  step_free_entrance: 'вхід без сходів', ramp: 'пандус', ramp_slope_ok: 'пологий пандус', door_width: 'широкий вхід',
  elevator: 'ліфт', accessible_toilet: 'доступний туалет', level_interior: 'рівна підлога',
  accessible_parking_near: 'паркування для людей з інвалідністю', tactile_guidance_entrance: 'тактильна навігація',
  braille_signage: 'шрифт Брайля', staff_assistance: 'допомога персоналу', good_lighting: 'добре освітлення',
  guide_dog_welcome: 'із собакою-поводирем', level_boarding: 'посадка врівень', step_free_to_stop: 'підхід без сходів',
  low_floor_vehicles: 'низькопідлоговий транспорт', tactile_paving: 'тактильна плитка', audio_announcements: 'аудіооголошення',
  high_contrast_edge: 'контрастний край', dropped_curb: 'занижений бордюр', acoustic_signal: 'звуковий сигнал',
  accessible_stall: 'доступна кабіна', grab_bars: 'поручні', turning_space: 'місце для розвороту',
  emergency_cord: 'тривожна кнопка', disabled_bay: 'місце для авто', bay_width: 'широке місце', near_entrance: 'біля входу',
};

const norm = (s) => (s || '').toLowerCase().replace(/[ʼ’]/g, "'").trim();
const VAL = { так: 'yes', ні: 'no', 'не застосовується': null };

async function ensureFile(name) {
  const dest = path.join(DATA_DIR, name);
  try {
    await access(dest);
    return dest;
  } catch {
    /* download below */
  }
  const url = `${BASE}/${RESOURCES[name]}/download/${name.toLowerCase()}`;
  process.stdout.write(`  downloading ${name} … `);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
  return dest;
}

function inLviv(p) {
  if (OBLAST) return norm(p.addressAdminUnitL2) === norm('Львівська область');
  return p.lng >= LVIV.minLng && p.lng <= LVIV.maxLng && p.lat >= LVIV.minLat && p.lat <= LVIV.maxLat;
}

// Map one feature's criteria → { featureKey: 'yes'|'no' } for the given category.
function mapFeatures(props, category, idTitle) {
  const out = {};
  const set = (key, val) => {
    if (!val) return;
    if (!(KEY_CATS[key] || []).includes(category)) return; // key not valid for this category
    if (out[key] === 'yes') return; // yes wins
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

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  console.log(`Mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY-RUN (no writes)'} · scope: ${OBLAST ? 'Lviv oblast' : 'Lviv city bbox'} · data: ${DATA_DIR}\n`);

  console.log('Loading criteria dictionary…');
  const criteria = JSON.parse(await readFile(await ensureFile('criteria.json'), 'utf8'));
  const idTitle = new Map(criteria.map((c) => [c.id, c.title]));

  let sql = null;
  if (APPLY) {
    const { default: postgres } = await import('postgres');
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set (run with --env-file=.env)');
    sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });
  }

  const targets = ONLY ? TARGETS.filter(([f]) => f === ONLY) : TARGETS;
  const totals = { features: 0, lviv: 0, withFeatures: 0, featureValues: 0, upserts: 0 };
  const samples = [];

  for (const [file, category] of targets) {
    const fc = JSON.parse(await readFile(await ensureFile(file), 'utf8'));
    let lviv = 0, withFeat = 0, fvals = 0;
    for (const f of fc.features || []) {
      const p = f.properties || {};
      const lng = Number(p.lon), lat = Number(p.lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      const row = { ...p, lng, lat };
      totals.features++;
      if (!inLviv(row)) continue;
      lviv++;

      const features = mapFeatures(p, category, idTitle);
      const nKeys = Object.keys(features).length;
      if (nKeys) withFeat++;
      fvals += nKeys;

      const name = (p.title || '').trim() || 'Без назви';
      const address = [p.addressThoroughfare, p.addressPostName].filter(Boolean).join(', ') || null;
      const osmId = `bezbar/${p.id}`;
      // Compose a readable description: place type + the actual wheelchair
      // amenities present (fallback to the monitoring class when none are known).
      const present = Object.entries(features)
        .filter(([, v]) => v === 'yes')
        .map(([k]) => FEATURE_LABELS[k])
        .filter(Boolean);
      const kindStr = (p.kind || '').trim();
      const cls = (p.ratingAuthority || '').trim();
      const a11y = present.length
        ? `Зручності для крісла колісного: ${present.slice(0, 5).join(', ')}.`
        : cls
          ? `${cls.charAt(0).toUpperCase()}${cls.slice(1)}.`
          : '';
      const description = [kindStr ? `${kindStr}.` : '', a11y].filter(Boolean).join(' ') || null;

      if (samples.length < 6 && nKeys >= 2) {
        samples.push({ name, category, address, description, features });
      }

      if (APPLY) {
        const [pt] = await sql`
          insert into points (name, category, geom, address, description, source, verify_status, osm_id)
          values (${name}, ${category},
                  ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                  ${address}, ${description}, 'imported', 'unverified', ${osmId})
          on conflict (osm_id) where osm_id is not null
          do update set name = excluded.name, geom = excluded.geom,
                        address = coalesce(excluded.address, points.address),
                        description = excluded.description, updated_at = now()
          returning id`;
        totals.upserts++;
        for (const [key, value] of Object.entries(features)) {
          await sql`
            insert into point_feature_values (point_id, feature_key, value)
            values (${pt.id}, ${key}, ${value}::feature_value)
            on conflict (point_id, feature_key) do update set value = excluded.value`;
        }
      }
    }
    totals.lviv += lviv;
    totals.withFeatures += withFeat;
    totals.featureValues += fvals;
    console.log(
      `  ${file.padEnd(24)} total ${String(fc.features.length).padStart(6)} · Lviv ${String(lviv).padStart(5)} · with-features ${String(withFeat).padStart(5)} · feature-values ${fvals}`,
    );
  }

  console.log('\n=== Summary ===');
  console.log(`Lviv points: ${totals.lviv}  (with ≥1 mapped feature: ${totals.withFeatures})`);
  console.log(`Total mapped feature-values: ${totals.featureValues}`);
  if (APPLY) console.log(`Upserted: ${totals.upserts} points`);
  console.log('\n=== Sample mapped points ===');
  for (const s of samples) {
    console.log(`• [${s.category}] ${s.name}${s.address ? ' — ' + s.address : ''}`);
    if (s.description) console.log(`    ${s.description}`);
    console.log(`    ${JSON.stringify(s.features)}`);
  }
  if (!APPLY) console.log('\n(DRY-RUN — re-run with --apply to write. Then run dedupe to merge with OSM.)');

  if (sql) await sql.end();
}

main().catch((e) => {
  console.error('bezbarrier import failed:', e.message);
  process.exitCode = 1;
});
