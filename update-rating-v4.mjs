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
    -- Hard nones: fundamental barriers
    when p_step_free     = false then 'none'
    when p_has_curb_cuts = false then 'none'
    when p_width   is not null and p_width < 0.9         then 'none'
    when p_incline is not null and abs(p_incline) > 8.33 then 'none'
    when p_smoothness = any(array['bad','very_bad','horrible','very_horrible','impassable']) then 'none'
    -- Bad surface is none unless good/excellent smoothness redeems it
    when p_surface = any(array['cobblestone','unhewn_cobblestone','pebblestone','gravel',
      'sand','ground','dirt','earth','grass','mud','unpaved','rock'])
     and p_smoothness is distinct from 'excellent'
     and p_smoothness is distinct from 'good' then 'none'
    -- Both key fields confirmed true: secondary signals decide full vs partial
    when p_has_curb_cuts = true and p_step_free = true then
      case
        when p_has_tactile   = false                               then 'partial'
        when p_obstacle_free = false                               then 'partial'
        when p_lit           = false                               then 'partial'
        when p_width   is not null and p_width < 1.5               then 'partial'
        when p_incline is not null and abs(p_incline) >= 6         then 'partial'
        when p_smoothness = 'intermediate'                         then 'partial'
        when p_surface = any(array['sett','concrete:lanes','compacted','fine_gravel']) then 'partial'
        when p_surface = any(array['cobblestone','unhewn_cobblestone','pebblestone'])
         and p_smoothness = any(array['good','excellent'])         then 'partial'
        else 'full'
      end
    -- Everything else: not enough data
    else 'unknown'
  end
$$;
`;

try {
  await client.query(sql);
  console.log('segment_rating() v4 applied');
} catch (e) {
  console.error('Failed:', e.message);
} finally {
  await client.end();
}
