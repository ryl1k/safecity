import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(`ALTER TABLE street_segments ADD COLUMN IF NOT EXISTS path_type text`);
console.log('✓ path_type column added');
const r = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='street_segments' AND column_name='path_type'`);
console.log('Verified:', r.rows[0]);
await c.end();
