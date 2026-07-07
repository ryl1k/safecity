// Quick DB sanity check. Run: node --env-file=.env scripts/check.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });
try {
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
  const funcs = await sql`
    select routine_name from information_schema.routines
    where routine_schema = 'public' and routine_name in ('points_near','points_in_bbox') order by routine_name`;
  const feat = await sql`select count(*)::int c, count(*) filter (where critical) crit from accessibility_features`;
  const postgis = await sql`select extname from pg_extension where extname = 'postgis'`;

  console.log('tables   :', tables.map((t) => t.table_name).join(', '));
  console.log('rpc      :', funcs.map((f) => f.routine_name).join(', ') || '(none)');
  console.log('features :', feat[0].c, `(${feat[0].crit} critical)`);
  console.log('postgis  :', postgis.length ? 'enabled' : 'MISSING');

  // Exercise the geo RPC the web will call (Lviv centre, 2 km).
  const near = await sql`select * from points_near(24.0316, 49.8419, 2000)`;
  console.log('points_near:', near.length, 'points');
  if (near[0]) {
    const p = near[0];
    console.log('  sample  :', p.name, '·', p.category, '·', Math.round(p.distance_m), 'm');
    console.log('  features:', JSON.stringify(p.features));
  }
} catch (e) {
  console.error('check failed:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
