// Dedupe loader (KB 09). Merges points that are within ~30 m AND have similar names
// (likely the same place from different sources). Idempotent and re-runnable.
// Dry-run by default — pass --apply to actually merge.
//   node --env-file=.env tooling/importers/dedupe.mjs [--apply]
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const RADIUS_M = Number(process.env.DEDUPE_RADIUS_M || 30);
const NAME_SIM = Number(process.env.DEDUPE_NAME_SIM || 0.6);

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[«»"'’.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tokens(s) {
  return new Set(normalize(s).split(' ').filter(Boolean));
}
function jaccard(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
function meters(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const x = dLng * Math.cos(lat);
  return Math.sqrt(x * x + dLat * dLat) * R;
}

// union-find
function find(parent, i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
function union(parent, i, j) { parent[find(parent, i)] = find(parent, j); }

async function main() {
  const rows = await sql`
    select p.id, p.name, p.category, p.verify_status, p.created_at, p.photos,
           ST_X(p.geom::geometry) as lng, ST_Y(p.geom::geometry) as lat,
           (select count(*) from point_feature_values fv where fv.point_id = p.id)::int as nfeatures
    from points p order by p.created_at`;
  console.log(`Scanning ${rows.length} points (radius ${RADIUS_M} m, name-sim ≥ ${NAME_SIM}) …`);

  const parent = rows.map((_, i) => i);
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].category !== rows[j].category) continue;
      if (meters(rows[i], rows[j]) > RADIUS_M) continue;
      if (jaccard(rows[i].name, rows[j].name) < NAME_SIM) continue;
      union(parent, i, j);
    }
  }

  const clusters = new Map();
  for (let i = 0; i < rows.length; i++) {
    const r = find(parent, i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r).push(i);
  }

  const score = (r) => r.nfeatures * 10 + (r.verify_status === 'official' ? 5 : r.verify_status === 'verified' ? 3 : 0);
  let merged = 0;
  for (const idxs of clusters.values()) {
    if (idxs.length < 2) continue;
    const members = idxs.map((i) => rows[i]).sort((a, b) => score(b) - score(a) || new Date(a.created_at) - new Date(b.created_at));
    const survivor = members[0];
    const dups = members.slice(1);
    console.log(`MERGE «${survivor.name}» ← ${dups.map((d) => `«${d.name}»`).join(', ')}`);
    merged += dups.length;
    if (!APPLY) continue;

    for (const dup of dups) {
      // Move feature values the survivor doesn't already have, then drop the rest.
      await sql`
        update point_feature_values fv set point_id = ${survivor.id}
        where fv.point_id = ${dup.id}
          and not exists (select 1 from point_feature_values s where s.point_id = ${survivor.id} and s.feature_key = fv.feature_key)`;
      await sql`delete from point_feature_values where point_id = ${dup.id}`;
      // Repoint reviews the survivor doesn't already have for that user/profile.
      await sql`
        update reviews r set point_id = ${survivor.id}
        where r.point_id = ${dup.id}
          and not exists (select 1 from reviews s where s.point_id = ${survivor.id} and s.user_id = r.user_id and s.profile = r.profile)`;
      await sql`delete from reviews where point_id = ${dup.id}`;
      // Repoint problems.
      await sql`update problems set point_id = ${survivor.id} where point_id = ${dup.id}`;
      // Merge photos.
      const photos = Array.from(new Set([...(survivor.photos || []), ...(dup.photos || [])]));
      await sql`update points set photos = ${photos} where id = ${survivor.id}`;
      await sql`delete from points where id = ${dup.id}`;
    }
  }

  console.log(APPLY ? `Dedupe applied: merged ${merged} duplicate(s).` : `Dry run: ${merged} duplicate(s) would be merged. Re-run with --apply.`);
}

try {
  await main();
} catch (e) {
  console.error('dedupe failed:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
