-- Rating v9: tighten 'unknown' definition and raise incline threshold to 10%.
--
-- unknown = segment exists but we have no meaningful accessibility signal:
--   no smoothness, no step_free, no curb_cuts, no width,
--   surface isn't a hard-block type, incline < 10%.
--
-- partial = has at least one useful signal (smoothness / step_free / curb_cuts / width)
--   but doesn't qualify for full.
--
-- none threshold: incline > 10 % (was 8 %).

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
    when p_incline is not null and abs(p_incline) > 10 then 'none'
    when p_smoothness = any (array['bad','very_bad','horrible','very_horrible','impassable']) then 'none'
    -- Truly impassable terrain without good smoothness → none.
    when p_surface = any (array[
      'dirt','earth','grass','mud','sand','ground','unpaved','rock','gravel'
    ]) and p_smoothness is distinct from 'excellent'
      and p_smoothness is distinct from 'good' then 'none'
    -- Confirmed access + no explicit secondary negatives → full.
    when p_step_free     = true
     and p_has_curb_cuts = true
     and (p_has_tactile   is null or p_has_tactile   = true)
     and (p_obstacle_free is null or p_obstacle_free = true)
     and (p_lit           is null or p_lit           = true)
     and (p_width   is null or p_width   >= 1.5)
     and (p_incline is null or abs(p_incline) <= 5)
    then 'full'
    -- Has at least one meaningful accessibility signal → partial.
    when p_smoothness    is not null
      or p_step_free     is not null
      or p_has_curb_cuts is not null
      or p_width         is not null
    then 'partial'
    -- Nothing useful to say about accessibility → unknown.
    else 'unknown'
  end
$$;

grant execute on function segment_rating(
  text, text, numeric, numeric, boolean, boolean, boolean, boolean, boolean
) to anon, authenticated;
