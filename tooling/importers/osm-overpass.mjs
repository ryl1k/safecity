// OSM Overpass importer (KB 09). Pulls accessibility-tagged features in a Lviv bbox,
// maps OSM tags → our feature catalog, and upserts idempotently keyed on osm_id.
// Data © OpenStreetMap contributors (ODbL). Run:
//   node --env-file=.env tooling/importers/osm-overpass.mjs
// Optional: LVIV_BBOX="S,W,N,E" (default central Lviv).
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });
const BBOX = process.env.LVIV_BBOX || '49.80,23.98,49.86,24.06'; // S,W,N,E
const ENDPOINT = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';

const QUERY = `[out:json][timeout:90];
(
  node["amenity"="toilets"](${BBOX});
  way["amenity"="toilets"](${BBOX});
  node["railway"="tram_stop"](${BBOX});
  node["highway"="bus_stop"](${BBOX});
  node["highway"="crossing"](${BBOX});
  node["amenity"="parking"]["capacity:disabled"](${BBOX});
  way["amenity"="parking"]["capacity:disabled"](${BBOX});
  node["wheelchair"](${BBOX});
  way["wheelchair"](${BBOX});
);
out center 800;`;

const tri = (v) => (v === 'yes' ? 'yes' : v === 'no' || v === 'limited' ? 'no' : null);
const bin = (v) => (v === 'yes' ? 'yes' : v === 'no' ? 'no' : null);

function categorize(t) {
  if (t.amenity === 'toilets') return 'toilet';
  if (t.railway === 'tram_stop' || t.highway === 'bus_stop' || t.public_transport) return 'transit';
  if (t.highway === 'crossing' || t.footway === 'crossing') return 'crossing';
  if (t.amenity === 'parking') return 'parking';
  return 'venue';
}

function featuresFor(cat, t) {
  const f = {};
  const wc = tri(t.wheelchair);
  const tp = bin(t.tactile_paving);
  if (cat === 'venue') {
    if (wc) f.step_free_entrance = wc;
    if (t['toilets:wheelchair']) f.accessible_toilet = tri(t['toilets:wheelchair']);
  } else if (cat === 'transit') {
    if (wc) { f.level_boarding = wc; f.step_free_to_stop = wc; }
    if (tp) f.tactile_paving = tp;
  } else if (cat === 'crossing') {
    if (tp) f.tactile_paving = tp;
    if (t.kerb === 'lowered' || t.kerb === 'flush') f.dropped_curb = 'yes';
    else if (t.kerb === 'raised') f.dropped_curb = 'no';
    if (t['traffic_signals:sound'] === 'yes' || t['traffic_signals:vibration'] === 'yes') f.acoustic_signal = 'yes';
  } else if (cat === 'toilet') {
    if (wc) f.accessible_stall = wc;
  } else if (cat === 'parking') {
    const cap = t['capacity:disabled'];
    if (cap && cap !== '0' && cap !== 'no') f.disabled_bay = 'yes';
    if (wc) f.disabled_bay = wc;
  }
  for (const k of Object.keys(f)) if (f[k] == null) delete f[k];
  return f;
}

const DEFAULT_NAME = {
  toilet: 'Громадський туалет',
  transit: 'Зупинка громадського транспорту',
  crossing: 'Пішохідний перехід',
  parking: 'Паркування для людей з інвалідністю',
};

function nameFor(cat, t) {
  if (t.name) return t.name;
  if (cat === 'transit' && t.railway === 'tram_stop') return 'Зупинка трамвая';
  return DEFAULT_NAME[cat] ?? null; // venue with no name → skip
}

function addressFor(t) {
  const street = t['addr:street'];
  const hn = t['addr:housenumber'];
  if (street && hn) return `${street}, ${hn}`;
  return street || null;
}

async function main() {
  console.log(`Querying Overpass for bbox ${BBOX} …`);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(QUERY),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
  const { elements } = await res.json();
  console.log(`Got ${elements.length} elements.`);

  let upserts = 0;
  let feats = 0;
  let skipped = 0;
  for (const el of elements) {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) { skipped++; continue; }
    const cat = categorize(t);
    const name = nameFor(cat, t);
    if (!name) { skipped++; continue; }
    const osmId = `${el.type}/${el.id}`;
    const address = addressFor(t);

    const [{ id }] = await sql`
      insert into points (name, category, geom, address, source, verify_status, osm_id)
      values (${name}, ${cat},
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
              ${address}, 'imported', 'verified', ${osmId})
      on conflict (osm_id) where osm_id is not null
      do update set name = excluded.name, geom = excluded.geom, address = excluded.address, updated_at = now()
      returning id`;
    upserts++;

    const features = featuresFor(cat, t);
    for (const [key, value] of Object.entries(features)) {
      await sql`
        insert into point_feature_values (point_id, feature_key, value)
        values (${id}, ${key}, ${value})
        on conflict (point_id, feature_key) do update set value = excluded.value`;
      feats++;
    }
  }
  console.log(`OSM import: ${upserts} points upserted, ${feats} feature values, ${skipped} skipped (no name/coords).`);
}

try {
  await main();
} catch (e) {
  console.error('osm import failed:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
