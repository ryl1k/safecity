// Google MyMaps KML importer (KB 09). Parses placemarks from an exported .kml and
// upserts them as imported Points (idempotent, keyed on a derived osm_id).
// KMZ? Unzip it first (the .kml inside). Run:
//   node --env-file=.env tooling/importers/mymaps-kml.mjs <path/to/map.kml> [category]
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const file = process.argv[2];
const defaultCategory = process.argv[3] || 'venue';
if (!file) {
  console.error('usage: node --env-file=.env tooling/importers/mymaps-kml.mjs <file.kml> [category]');
  process.exit(1);
}

const VALID = ['venue', 'transit', 'crossing', 'toilet', 'parking'];
if (!VALID.includes(defaultCategory)) {
  console.error(`category must be one of: ${VALID.join(', ')}`);
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

function decode(s) {
  return (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decode(m[1]) : null;
}

async function main() {
  const xml = await readFile(file, 'utf8');
  const placemarks = [...xml.matchAll(/<Placemark\b[\s\S]*?<\/Placemark>/gi)].map((m) => m[0]);
  console.log(`Found ${placemarks.length} placemarks in ${file}.`);

  let upserts = 0;
  let skipped = 0;
  for (const pm of placemarks) {
    const name = pick(pm, 'name');
    const coordsRaw = pick(pm, 'coordinates');
    if (!name || !coordsRaw) { skipped++; continue; }
    // coordinates: "lng,lat[,alt]" (first vertex if a line/poly)
    const first = coordsRaw.split(/\s+/)[0];
    const [lng, lat] = first.split(',').map(Number);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) { skipped++; continue; }
    const description = pick(pm, 'description');
    const osmId = `mymaps/${lng.toFixed(5)},${lat.toFixed(5)}`;

    await sql`
      insert into points (name, category, geom, description, source, verify_status, osm_id)
      values (${name}, ${defaultCategory},
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
              ${description}, 'imported', 'unverified', ${osmId})
      on conflict (osm_id) where osm_id is not null
      do update set name = excluded.name, geom = excluded.geom, description = excluded.description, updated_at = now()`;
    upserts++;
  }
  console.log(`MyMaps import: ${upserts} points upserted, ${skipped} skipped (no name/coords).`);
}

try {
  await main();
} catch (e) {
  console.error('mymaps import failed:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
