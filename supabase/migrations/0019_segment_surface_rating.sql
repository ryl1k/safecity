-- Rebuild the street-segment accessibility rating around what OSM actually
-- carries for sidewalks: `surface` and `smoothness`. The old rating (0016)
-- looked only at is_step_free + width + curb_cuts — none of which OSM sidewalks
-- tag — so every imported segment collapsed to 'unknown', while a rough `sett`
-- (cobblestone-cut-stone) street rendered identically to smooth asphalt.
--
-- Schema-only + logic-only: adds a `smoothness` column and a `segment_rating()`
-- function, and rewrites `segments_in_bbox()` to use it. Existing rows are
-- re-rated on read (they already have `surface`) — no data is mutated or
-- deleted here. The importer's own prune step handles cleanup.

alter table street_segments add column if not exists smoothness text;

-- segment_rating: full / partial / none / unknown from the wheelchair-relevant
-- signals. Rubric (OSM wiki + ORS wheelchair defaults + ADA), key rules:
--   • the verdict is the WORSE of surface and smoothness — a smoothness tag can
--     never rescue a rough-stone surface to 'full' (OSM's own smoothness=good
--     example is literally "well-maintained sett");
--   • hard barriers (impassable surface/smoothness, width < 0.9 m, incline
--     > 8.33 %, explicit not-step-free) force 'none';
--   • width 0.9–1.5 m and incline 6–8.33 % downgrade an otherwise-full segment
--     to 'partial';
--   • 'unknown' only when there is no rollability signal at all.
-- is_step_free carries the explicit `wheelchair` tag (no → false, yes → true).
create or replace function segment_rating(
  p_surface    text,
  p_smoothness text,
  p_width      numeric,
  p_incline    numeric,
  p_step_free  boolean
) returns text
language sql
immutable
as $$
  select case
    -- Hard barriers → none.
    when p_step_free = false then 'none'
    when p_width   is not null and p_width < 0.9 then 'none'
    when p_incline is not null and abs(p_incline) > 8.33 then 'none'
    when p_surface = any (array[
      'cobblestone','unhewn_cobblestone','pebblestone','gravel',
      'sand','ground','dirt','earth','grass','mud','unpaved','rock']) then 'none'
    when p_smoothness = any (array[
      'bad','very_bad','horrible','very_horrible','impassable']) then 'none'
    -- Rough but passable → partial (worse-of: any POOR signal caps here).
    when p_surface = any (array['sett','concrete:lanes','compacted','fine_gravel']) then 'partial'
    when p_smoothness = 'intermediate' then 'partial'
    -- Good surface / good-or-excellent smoothness → full, minus width/incline downgrades.
    when p_surface = any (array[
      'asphalt','concrete','paving_stones','concrete:plates','paved','wood','metal'])
      or p_smoothness = any (array['excellent','good']) then
        case
          when p_width   is not null and p_width < 1.5 then 'partial'
          when p_incline is not null and abs(p_incline) >= 6 then 'partial'
          else 'full'
        end
    -- Only positive signal is an explicit wheelchair=yes (folded into step_free).
    when p_step_free then 'full'
    else 'unknown'
  end
$$;

grant execute on function segment_rating(text, text, numeric, numeric, boolean) to anon, authenticated;

-- segments_in_bbox now delegates the verdict to segment_rating() and also
-- returns `smoothness`. The OUT columns changed, so drop + recreate.
drop function if exists segments_in_bbox(double precision, double precision, double precision, double precision);

create function segments_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
returns table (
  id                 uuid,
  street_name        text,
  sidewalk_width_m   numeric,
  surface_type       text,
  incline_percent    numeric,
  has_tactile_paving boolean,
  is_step_free       boolean,
  has_curb_cuts      boolean,
  has_ramp           boolean,
  lit                boolean,
  smoothness         text,
  verify_status      text,
  rating             text,
  geojson            text
)
language sql
stable
as $$
  select
    s.id,
    s.street_name,
    s.sidewalk_width_m,
    s.surface_type,
    s.incline_percent,
    s.has_tactile_paving,
    s.is_step_free,
    s.has_curb_cuts,
    s.has_ramp,
    s.lit,
    s.smoothness,
    s.verify_status::text,
    segment_rating(s.surface_type, s.smoothness, s.sidewalk_width_m, s.incline_percent, s.is_step_free),
    ST_AsGeoJSON(s.geom)
  from street_segments s
  where s.geom && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326);
$$;

grant execute on function segments_in_bbox(
  double precision, double precision, double precision, double precision
) to anon, authenticated;
