import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const r2 = await c.query(`
  SELECT path_type,
         count(*) total,
         count(surface_type) has_surface,
         count(smoothness) has_smoothness,
         count(incline_percent) has_incline
  FROM street_segments
  GROUP BY path_type ORDER BY total DESC
`);
console.log('Coverage by path_type:');
console.log('path_type            total   surface  smooth  incline');
for (const x of r2.rows) {
  console.log(
    (x.path_type??'NULL').padEnd(20),
    String(x.total).padEnd(7),
    String(x.has_surface).padEnd(8),
    String(x.has_smoothness).padEnd(7),
    x.has_incline
  );
}

// Sample named streets with no surface
const r = await c.query(`
  SELECT osm_way_id, street_name, path_type, surface_type, smoothness
  FROM street_segments
  WHERE street_name != '' AND surface_type IS NULL
  LIMIT 5
`);
console.log('\nSample named streets with no surface_type:');
for (const x of r.rows) console.log(JSON.stringify(x));

await c.end();
