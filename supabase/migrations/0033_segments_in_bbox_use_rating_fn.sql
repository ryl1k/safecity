-- segments_in_bbox was last rewritten in 0021 and still carries a hand-rolled
-- inline CASE that diverged from segment_rating() as the function evolved.
-- The inline CASE never checked surface_type in the 'unknown' branch, so
-- segments with only a surface tag (the majority of OSM imports) incorrectly
-- showed as 'unknown' instead of 'partial'.
--
-- Fix: replace the inline CASE with a direct call to segment_rating().
-- One source of truth; any future rating change only needs to touch that function.

drop function if exists segments_in_bbox(
  double precision, double precision, double precision, double precision
);

create function segments_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
returns table (
  id                  text,
  street_name         text,
  sidewalk_width_m    double precision,
  surface_type        text,
  smoothness          text,
  incline_percent     double precision,
  has_tactile_paving  boolean,
  is_step_free        boolean,
  has_curb_cuts       boolean,
  has_ramp            boolean,
  lit                 boolean,
  is_obstacle_free    boolean,
  verify_status       text,
  rating              text,
  field_sources       jsonb,
  geojson             text
)
language sql stable
as $$
  select
    s.id::text,
    s.street_name,
    s.sidewalk_width_m,
    s.surface_type,
    s.smoothness,
    s.incline_percent,
    s.has_tactile_paving,
    s.is_step_free,
    s.has_curb_cuts,
    s.has_ramp,
    s.lit,
    s.is_obstacle_free,
    s.verify_status::text,
    segment_rating(
      s.surface_type,
      s.smoothness,
      s.sidewalk_width_m,
      s.incline_percent,
      s.is_step_free,
      s.lit,
      s.has_curb_cuts,
      s.has_tactile_paving,
      s.is_obstacle_free
    ) as rating,
    s.field_sources,
    ST_AsGeoJSON(s.geom) as geojson
  from street_segments s
  where s.geom && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326);
$$;

grant execute on function segments_in_bbox(
  double precision, double precision, double precision, double precision
) to anon, authenticated;
