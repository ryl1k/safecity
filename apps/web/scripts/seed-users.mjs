// Seed a test user + an admin (moderator) via the Supabase admin API. Idempotent.
// Run: node --env-file=.env apps/web/scripts/seed-users.mjs
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const USERS = [
  { email: 'test@safecity.app', password: 'Test12345!', role: 'user' },
  { email: 'admin@safecity.app', password: 'Admin12345!', role: 'moderator' },
];

const url = process.env.SUPABASE_URL?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !secret) {
  console.error('SUPABASE_URL / SUPABASE_SECRET_KEY missing');
  process.exit(1);
}

const supa = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

try {
  for (const u of USERS) {
    let id;
    const existing = await sql`select id from auth.users where email = ${u.email}`;
    if (existing.length) {
      id = existing[0].id;
      console.log(`= ${u.email} exists`);
    } else {
      const { data, error } = await supa.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
      });
      if (error) {
        console.error(`! ${u.email}: ${error.message}`);
        continue;
      }
      id = data.user.id;
      console.log(`+ ${u.email} created`);
    }
    await sql`insert into profiles (id, display_name) values (${id}, ${u.email.split('@')[0]}) on conflict (id) do nothing`;
    await sql`update profiles set role = ${u.role} where id = ${id}`;
    console.log(`  role=${u.role}  password=${u.password}`);
  }
} catch (e) {
  console.error('seed-users failed:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
