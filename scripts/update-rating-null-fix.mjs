import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const sql = `
create or replace function segment_rating(
  p_surface          text,
  p_smoothness       text,
  p_width            numeric,
  p_incline          numeric,
  p_step_free        boolean,
  p_lit              boolean  default null,
  p_has_curb_cuts    boolean  default null,
  p_has_tactile      boolean  default null,
  p_obstacle_free    boolean  default null
) returns text language sql immutable as $$
  select case
    -- Hard barriers: explicit FALSE only
    when p_step_free      = false then 'none'
    when p_has_curb_cuts  = false then 'none'
    when p_has_tactile    = false then 'none'
    when p_obstacle_free  = false then 'none'
    when p_width   is not null and p_width < 0.9    then 'none'
    when p_incline is not null and abs(p_incline) > 8.33 then 'none'
    when p_surface = any (array['cobblestone','unhewn_cobblestone','pebblestone','gravel',
      'sand','ground','dirt','earth','grass','mud','unpaved','rock']) then 'none'
    when p_smoothness = any (array['bad','very_bad','horrible','very_horrible','impassable']) then 'none'
    -- Rough-but-passable → partial
    when p_surface = any (array['sett','concrete:lanes','compacted','fine_gravel']) then 'partial'
    when p_smoothness = 'intermediate' then 'partial'
    -- Good surface/smoothness: null on safety fields caps at partial (unknown ≠ confirmed safe)
    when p_surface = any (array['asphalt','concrete','paving_stones','concrete:plates','paved','wood','metal'])
      or p_smoothness = any (array['excellent','good']) then
        case
          when p_width   is not null and p_width < 1.5    then 'partial'
          when p_incline is not null and abs(p_incline) >= 6 then 'partial'
          when p_lit            = false                   then 'partial'
          when p_has_curb_cuts  is not true               then 'partial'
          when p_has_tactile    is not true               then 'partial'
          when p_obstacle_free  is not true               then 'partial'
          else 'full'
        end
    -- Explicit wheelchair=yes: same safety-field guard
    when p_step_free = true then
        case
          when p_lit           = false  then 'partial'
          when p_has_curb_cuts is not true then 'partial'
          when p_has_tactile   is not true then 'partial'
          when p_obstacle_free is not true then 'partial'
          else 'full'
        end
    else 'unknown'
  end
$$;
`;

try {
  await client.query(sql);
  console.log('segment_rating() updated: null safety fields now cap rating at partial');
} catch (e) {
  console.error('Failed:', e.message);
} finally {
  await client.end();
}
