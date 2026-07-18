-- Rating v5: treat NULL step_free / curb_cuts as "untagged, not blocked".
-- Previously those NULLs fell straight to 'unknown', so 93 % of OSM-imported
-- sidewalks (which rarely carry is_step_free or has_curb_cuts tags) were
-- invisible to the map.
--
-- Changes from v4 (0028):
--   • abs(incline) > 8 % added as a hard 'none'.
--   • Any surface / smoothness / width / incline / access signal → at least 'partial';
--     NULL step_free / curb_cuts alone no longer collapse to 'unknown'.
--   • 'full' gate unchanged: still requires step_free=true AND curb_cuts=true.
--   • 'unknown' only when there is truly zero rollability signal.

create or replace function segment_rating(
  p_surface        text,
  p_smoothness     text,
  p_width          numeric,
  p_incline        numeric,
  p_step_free      boolean,
  p_lit            boolean,
  p_has_curb_cuts  boolean,
  p_has_tactile    boolean,
  p_obstacle_free  boolean
) returns text
language sql
immutable
as $$
  select case
    -- Hard barriers → none.
    when p_step_free     = false then 'none'
    when p_has_curb_cuts = false then 'none'
    when p_width is not null and p_width < 0.9 then 'none'
    when p_incline is not null and abs(p_incline) > 8 then 'none'
    when p_smoothness = any (array['bad','very_bad','horrible','very_horrible','impassable']) then 'none'
    when p_surface = any (array['cobblestone','unhewn_cobblestone','pebblestone','gravel',
      'sand','ground','dirt','earth','grass','mud','unpaved','rock'])
     and p_smoothness is distinct from 'excellent'
     and p_smoothness is distinct from 'good' then 'none'
    -- Both confirmed + no secondary negatives + positive surface signal → full.
    when p_step_free = true
     and p_has_curb_cuts = true
     and (p_has_tactile   is null or p_has_tactile   = true)
     and (p_obstacle_free is null or p_obstacle_free = true)
     and (p_lit           is null or p_lit           = true)
     and (p_width is null or p_width >= 1.5)
     and p_smoothness is distinct from 'intermediate'
     and (
       p_surface = any (array['asphalt','concrete','paving_stones','paved','wood','metal'])
       or p_smoothness = any (array['good','excellent'])
     )
    then 'full'
    -- Any rollability signal → partial.
    when p_surface     is not null
      or p_smoothness  is not null
      or p_width       is not null
      or p_incline     is not null
      or p_step_free   is not null
      or p_has_curb_cuts is not null
    then 'partial'
    -- Truly no data.
    else 'unknown'
  end
$$;

grant execute on function segment_rating(
  text, text, numeric, numeric, boolean, boolean, boolean, boolean, boolean
) to anon, authenticated;
