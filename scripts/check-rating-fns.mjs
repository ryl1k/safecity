import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const res = await client.query(`
  SELECT proname, pg_get_function_arguments(oid) as args
  FROM pg_proc WHERE proname = 'segment_rating'
`);
console.log('segment_rating overloads:');
res.rows.forEach(r => console.log(' -', r.args));
await client.end();
