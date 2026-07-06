// Normalize demo analytics so the business dashboard graphs read like real usage
// instead of sparse spikes. Two independent passes, both idempotent:
//
//   1. point_metric_snapshots — rebuild ~30 days of per-point rows with a smooth,
//      monotonically-rising cumulative view/search series ending at the point's
//      CURRENT totals (so the totals shown elsewhere stay consistent). This drives
//      the "Нові перегляди та пошуки" per-day graph.
//   2. reviews.created_at — spread the existing reviews evenly across the last
//      ~50 days so the reviews-over-time graph stops showing a spike of N on the
//      handful of seed days. Review *density* is capped by the review data model
//      (unique(point_id,user_id,profile)); this only de-clusters what exists.
//
// Scoped to business-owned points (created_by IS NOT NULL). Creates no users and
// touches no other data. Run: node --env-file=.env scripts/seed-analytics.mjs
import postgres from 'postgres';

const DAYS = 30; // snapshot window
const REVIEW_SPAN = 50; // days over which to spread reviews

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

// A monotonically non-decreasing cumulative series of `days` values ending exactly
// at `end`, starting near `end * startFrac`, with small varied daily deltas (the
// per-day graph is the diff of consecutive rows, so varied deltas => organic curve).
function series(end, days, startFrac = 0.25) {
  const start = Math.max(0, Math.round(end * startFrac));
  const growth = end - start;
  const out = [];
  let cum = start;
  for (let i = 0; i < days; i++) {
    if (i === days - 1) {
      cum = end; // last row pinned to the current total
    } else if (growth > 0) {
      // average daily step, jittered 0.4x–1.6x, never overshooting the pre-final value
      const step = Math.round((growth / days) * (0.4 + Math.random() * 1.2));
      cum = Math.min(end - 1, cum + Math.max(0, step));
    }
    out.push(cum);
  }
  return out;
}

try {
  const points = await sql`
    select id::text, name, view_count, search_appearances
    from points
    where created_by is not null
    order by created_at`;
  console.log(`business points: ${points.length}`);

  // --- Pass 1: smooth metric snapshots -------------------------------------
  for (const p of points) {
    const views = series(Math.max(p.view_count, DAYS), DAYS, 0.25);
    const searches = series(Math.max(p.search_appearances, Math.round(DAYS / 2)), DAYS, 0.2);
    // Wipe this point's window, then reinsert (keeps the run idempotent regardless
    // of how many rows a prior snapshot-on-read left behind).
    await sql`
      delete from point_metric_snapshots
      where point_id = ${p.id}::uuid
        and day >= current_date - make_interval(days => ${DAYS - 1})`;
    for (let i = 0; i < DAYS; i++) {
      const offset = DAYS - 1 - i; // i=0 => oldest, i=DAYS-1 => today
      await sql`
        insert into point_metric_snapshots (point_id, day, view_count, search_appearances)
        values (${p.id}::uuid, current_date - make_interval(days => ${offset}), ${views[i]}, ${searches[i]})
        on conflict (point_id, day) do update
          set view_count = excluded.view_count,
              search_appearances = excluded.search_appearances`;
    }
    console.log(`  ~ ${p.name}: ${DAYS}d snapshots -> ${views[DAYS - 1]} views / ${searches[DAYS - 1]} searches`);
  }

  // --- Pass 2: de-cluster reviews ------------------------------------------
  // Deterministic order => re-running lands each review on the same day.
  const reviews = await sql`
    select r.id::text
    from reviews r
    join points p on p.id = r.point_id
    where p.created_by is not null
    order by r.point_id, r.id`;
  const n = reviews.length;
  for (let i = 0; i < n; i++) {
    // Even spread across the span, plus a per-review hour so same-day ties (if any)
    // still order sensibly. Newest review => today, oldest => ~REVIEW_SPAN days ago.
    const offset = n <= 1 ? 0 : Math.round((i / (n - 1)) * REVIEW_SPAN);
    const hour = (i * 7) % 24;
    await sql`
      update reviews
      set created_at = (current_date - make_interval(days => ${offset})) + ${`${hour}:00:00`}::time
      where id = ${reviews[i].id}::uuid`;
  }
  console.log(`  ~ ${n} reviews spread across ${REVIEW_SPAN}d`);

  console.log('done');
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await sql.end();
}
