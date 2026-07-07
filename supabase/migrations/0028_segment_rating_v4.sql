-- Codify the canonical wheelchair segment rating that had, until now, only ever
-- been applied to the live DB via loose one-off scripts (update-rating-*.mjs) and
-- never captured as a migration. That drift meant a DB built purely from
-- migrations had only the older 5-arg segment_rating() from 0019, while the app
-- code and segments_in_bbox() call the richer 9-arg version — surfacing in prod
-- as `function segment_rating(text,text,numeric,numeric,boolean) ... does not
-- exist` on the routing avoidance path.
--
-- This version folds in lit / curb-cut / tactile / obstacle-free signals on top
-- of surface, smoothness, width, incline and step-free. It ADDS a 9-arg overload
-- (the 5-arg one from 0019 stays for the existing rating integration test).

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
    when p_step_free     = false then 'none'
    when p_has_curb_cuts = false then 'none'
    when p_width is not null and p_width < 0.9 then 'none'
    when p_smoothness = any (array['bad','very_bad','horrible','very_horrible','impassable']) then 'none'
    when p_surface = any (array['cobblestone','unhewn_cobblestone','pebblestone','gravel',
      'sand','ground','dirt','earth','grass','mud','unpaved','rock'])
     and p_smoothness is distinct from 'excellent'
     and p_smoothness is distinct from 'good' then 'none'
    when p_has_curb_cuts = true and p_step_free = true then
      case
        when p_has_tactile   = false then 'partial'
        when p_obstacle_free = false then 'partial'
        when p_lit           = false then 'partial'
        when p_width is not null and p_width < 1.5 then 'partial'
        when p_smoothness = 'intermediate' then 'partial'
        when p_surface = any (array['sett','concrete:lanes','compacted','fine_gravel']) then 'partial'
        when p_surface = any (array['cobblestone','unhewn_cobblestone','pebblestone'])
         and p_smoothness = any (array['good','excellent']) then 'partial'
        else 'full'
      end
    else 'unknown'
  end
$$;

grant execute on function segment_rating(
  text, text, numeric, numeric, boolean, boolean, boolean, boolean, boolean
) to anon, authenticated;
