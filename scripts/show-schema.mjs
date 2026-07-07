import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='street_segments' ORDER BY ordinal_position`);
r.rows.forEach(x => console.log(x.column_name.padEnd(30), x.data_type));
await c.end();
