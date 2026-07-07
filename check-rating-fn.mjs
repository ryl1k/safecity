import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'segment_rating'`);
console.log(r.rows[0]?.prosrc ?? 'function not found');
await c.end();
