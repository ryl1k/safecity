/**
 * Enriches street_segments from the gov pathways.geojson dataset.
 * For each assessed point in Lviv, maps known criteria IDs to DB fields
 * and updates the nearest segment(s) within 80m.
 *
 * Usage:
 *   node --env-file=.env tooling/importers/enrich-gov.mjs
 */
import pg from 'pg';
import { readFile } from 'fs/promises';

const GEOJSON_PATH = 'D:/code/Hackathon/26.06.2026/datasets/gov/pathways.geojson';
const CENTER_LAT = 49.8419, CENTER_LNG = 24.0318, RADIUS_DEG = 0.025; // ~2.2km

// Maps criterion ID → { field, yes value, no value }
const CRITERIA_MAP = {
  // Old-format criteria (0600xxx, 1100xxx, etc.)
  '0600030': { field: 'smoothness',         yes: 'good',  no: 'bad'  },  // sidewalk flat
  '0600159': { field: 'sidewalk_width_m',   yes: 1.8,     no: 1.0   },  // width ≥ 1.8m
  '0600160': { field: 'surface_type',       yes: 'asphalt',no: null  },  // hard surface
  '0600143': { field: 'has_tactile_paving', yes: true,    no: false },
  '0600141': { field: 'has_curb_cuts',      yes: true,    no: false },
  '0600286': { field: 'is_obstacle_free',   yes: true,    no: false },
  '1100040': { field: 'has_curb_cuts',      yes: true,    no: false },
  '1100164': { field: 'has_tactile_paving', yes: true,    no: false },
  '0100008': { field: null, yes: null, no: null },  // step markings — indicates steps exist, not step-free
  '1600473': { field: 'lit',                yes: true,    no: false },

  // New-format criteria (6900xxx–7600xxx) — Lviv assessments use these
  '6900860': { field: 'is_obstacle_free',   yes: true,    no: false },  // path free of obstacles
  '6900861': { field: 'sidewalk_width_m',   yes: 1.8,     no: 1.0   },  // width ≥ 1.8m
  '6900862': { field: 'has_curb_cuts',      yes: true,    no: false },  // paths at same level / curb cuts
  '6900863': { field: 'smoothness',         yes: 'good',  no: 'bad'  },  // pavement even, no potholes
  '6900864': { field: 'is_step_free',       yes: true,    no: false },  // if incline > 5%, ramp exists
  '6900865': { field: 'has_tactile_paving', yes: true,    no: false },  // tactile directional paving
  '6900866': { field: 'has_tactile_paving', yes: true,    no: false },  // tactile guide strip when no standard guides
  '6900867': { field: 'is_step_free',       yes: true,    no: false },  // no steps OR steps+ramp on path
  '6900868': { field: 'is_step_free',       yes: true,    no: false },  // all individual steps replaced by ramps
  '6900869': { field: 'is_step_free',       yes: true,    no: false },  // ramp specs met (slope ≤ 8%, width ≥ 1.2m, railings)
  '6900870': { field: 'has_tactile_paving', yes: true,    no: false },  // stairs uniform + contrast colour marking
  '6900871': { field: 'has_tactile_paving', yes: true,    no: false },  // tactile warning strip before obstacles/stairs
  '6900872': { field: 'is_obstacle_free',   yes: true,    no: false },  // drain gratings ≤1.5cm (wheelchair-safe)
  '7000873': { field: 'has_curb_cuts',      yes: true,    no: false },  // curb cuts at crossings
  '7000874': { field: 'has_tactile_paving', yes: true,    no: false },  // tactile warning strips at road
  '7100877': { field: 'is_step_free',       yes: true,    no: false },  // ramps/lifts or ground-level crossings
  '7300890': { field: 'sidewalk_width_m',   yes: 1.8,     no: 1.0   },  // width ≥ 1.8m
  '7300891': { field: 'is_obstacle_free',   yes: true,    no: false },  // paths at same level, no obstacles
  '7400899': { field: 'is_step_free',       yes: true,    no: false },  // open steps duplicated by ramps
  '7400901': { field: 'is_step_free',       yes: true,    no: false },  // individual steps replaced by ramps
};

function extractUpdates(categories) {
  const updates = {};
  for (const cat of categories ?? []) {
    for (const c of cat.criteria ?? []) {
      const mapping = CRITERIA_MAP[c.id];
      if (!mapping || !mapping.field) continue;
      const val = c.value === 'так' ? mapping.yes
                : c.value === 'ні'  ? mapping.no
                : null;
      if (val === null || val === undefined) continue;
      // Don't overwrite a more specific value with a less specific one
      if (updates[mapping.field] === undefined) {
        updates[mapping.field] = val;
      }
    }
  }
  return updates;
}

const geojson = JSON.parse(await readFile(GEOJSON_PATH, 'utf8'));
const lvivFeatures = geojson.features.filter(f => {
  const [lng, lat] = f.geometry.coordinates;
  return Math.abs(lat - CENTER_LAT) < RADIUS_DEG && Math.abs(lng - CENTER_LNG) < RADIUS_DEG;
});
console.log(`Lviv features in dataset: ${lvivFeatures.length}`);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

let updated = 0, skipped = 0;

for (const feat of lvivFeatures) {
  const [lng, lat] = feat.geometry.coordinates;
  const updates = extractUpdates(feat.properties.categories);

  if (Object.keys(updates).length === 0) { skipped++; continue; }

  const fields = Object.keys(updates);
  const vals   = Object.values(updates);
  const setClauses = fields.map((f, i) => `${f} = COALESCE(${f}, $${i + 3})`).join(', ');

  // Update segments within 80m of the gov point, only filling NULL fields (don't overwrite OSM data)
  const res = await client.query(
    `UPDATE street_segments
     SET ${setClauses}
     WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 80)`,
    [lng, lat, ...vals]
  );
  if (res.rowCount > 0) updated += res.rowCount;
  else skipped++;
}

console.log(`✓ Updated ${updated} segment rows from ${lvivFeatures.length} gov points (${skipped} had no match or no useful data)`);

// Show what changed
const filled = await client.query(`
  SELECT
    count(*) FILTER (WHERE has_tactile_paving IS NOT NULL) AS tactile,
    count(*) FILTER (WHERE has_curb_cuts IS NOT NULL)      AS curb_cuts,
    count(*) FILTER (WHERE is_obstacle_free IS NOT NULL)   AS obstacle_free,
    count(*) FILTER (WHERE smoothness IS NOT NULL)         AS smoothness,
    count(*) FILTER (WHERE sidewalk_width_m IS NOT NULL)   AS width,
    count(*) FILTER (WHERE surface_type IS NOT NULL)       AS surface
  FROM street_segments
`);
console.log('\nField coverage after enrichment:');
console.log(filled.rows[0]);

await client.end();
