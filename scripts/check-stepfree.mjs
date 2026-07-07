import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`
  SELECT
    count(*) total,
    count(is_step_free) has_value,
    count(*) FILTER (WHERE is_step_free = true)  AS step_free_true,
    count(*) FILTER (WHERE is_step_free = false) AS step_free_false
  FROM street_segments
`);
console.log(r.rows[0]);
await c.end();
