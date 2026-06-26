// Minimal migration runner: applies supabase/migrations/*.sql in lexical order against
// DATABASE_URL, tracking applied files in a _migrations table. Idempotent.
// Run with: node --env-file=.env scripts/migrate.mjs
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (use: node --env-file=.env scripts/migrate.mjs)');
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require', max: 1, prepare: false });

try {
  await sql`create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set((await sql`select name from _migrations`).map((r) => r.name));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= skip ${file}`);
      continue;
    }
    const content = await readFile(join(migrationsDir, file), 'utf8');
    process.stdout.write(`+ apply ${file} ... `);
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`insert into _migrations (name) values (${file})`;
    });
    console.log('ok');
    ran++;
  }
  console.log(`done — ${ran} applied, ${files.length - ran} skipped`);
} catch (err) {
  console.error('\nmigration failed:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
