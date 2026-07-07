import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('DROP FUNCTION IF EXISTS segment_rating(text, text, numeric, numeric, boolean, boolean)');
  console.log('Dropped 6-arg segment_rating()');
} catch (e) {
  console.error('Failed:', e.message);
} finally {
  await client.end();
}
