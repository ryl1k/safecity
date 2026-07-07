// Promote a user to moderator by email.
// Run: node --env-file=.env scripts/make-admin.mjs you@example.com
import postgres from 'postgres';

const email = process.argv[2];
if (!email) {
  console.error('usage: node --env-file=.env scripts/make-admin.mjs <email>');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });
try {
  const rows = await sql`
    update profiles set role = 'moderator'
    where id = (select id from auth.users where email = ${email})
    returning id`;
  if (rows.length) console.log(`✓ ${email} is now a moderator`);
  else console.log(`no user found for ${email} (sign up first, then re-run)`);
} catch (e) {
  console.error('failed:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
