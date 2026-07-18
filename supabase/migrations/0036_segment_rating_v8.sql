-- Rating v8: surface quality and smoothness do not gate 'full'.
-- Only truly impassable terrain (dirt/grass/sand/mud/gravel/unpaved) without
-- good smoothness forces 'none'. Sett, cobblestone, intermediate smoothness, etc.
-- are fine — what matters for full is confirmed step-free + curb-cut access and
-- no explicit secondary negatives.
--
-- Rules:
--   none  : explicit step_free=false | curb_cuts=false | width<0.9 | incline>8%
--           | bad/horrible smoothness
--           | impassable surface (dirt/grass/sand/mud/unpaved/gravel/rock/ground)
--             without good/excellent smoothness to redeem it
--   full  : step_free=true AND curb_cuts=true
--           AND no secondary explicit negatives (tactile/obstacle_free/lit not false)
--           AND width>=1.5 if known
--           AND incline<=5% if known
--           AND any positive data present (so we don't declare full on zero evidence)
--   partial: any rollability signal, no hard blocker, doesn't meet full
--   unknown: truly no data

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
    -- Truly impassable terrain without good smoothness to redeem it → none.
    when p_surface = any (array[
      'dirt','earth','grass','mud','sand','ground','unpaved','rock','gravel'
    ]) and p_smoothness is distinct from 'excellent'
      and p_smoothness is distinct from 'good' then 'none'
    -- Confirmed access + no explicit secondary negatives → full.
    when p_step_free    = true
     and p_has_curb_cuts = true
     and (p_has_tactile   is null or p_has_tactile   = true)
     and (p_obstacle_free is null or p_obstacle_free = true)
     and (p_lit           is null or p_lit           = true)
     and (p_width   is null or p_width   >= 1.5)
     and (p_incline is null or abs(p_incline) <= 5)
    then 'full'
    -- Any rollability signal, no hard blocker → partial.
    when p_surface       is not null
      or p_smoothness    is not null
      or p_width         is not null
      or p_incline       is not null
      or p_step_free     is not null
      or p_has_curb_cuts is not null
    then 'partial'
    else 'unknown'
  end
$$;

grant execute on function segment_rating(
  text, text, numeric, numeric, boolean, boolean, boolean, boolean, boolean
) to anon, authenticated;
