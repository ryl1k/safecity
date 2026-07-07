alter table street_segments
  add column if not exists is_obstacle_free boolean default null;

drop function if exists segments_in_bbox(double precision, double precision, double precision, double precision);

create function segments_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
returns table (
  id                text,
  street_name       text,
  sidewalk_width_m  double precision,
  surface_type      text,
  smoothness        text,
  incline_percent   double precision,
  has_tactile_paving  boolean,
  is_step_free      boolean,
  has_curb_cuts     boolean,
  has_ramp          boolean,
  lit               boolean,
  is_obstacle_free  boolean,
  verify_status     text,
  rating            text,
  field_sources     jsonb,
  geojson           text
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
    case
      when s.surface_type in (
        'grass', 'ground', 'dirt', 'mud', 'sand', 'earth', 'rock', 'unpaved'
      ) then 'none'
      when s.smoothness in (
        'intermediate', 'bad', 'very_bad', 'horrible', 'very_horrible', 'impassable'
      ) then 'none'
      when s.is_step_free = false then 'none'
      when s.is_obstacle_free = false then 'none'
      when s.smoothness in ('excellent', 'good')
        and s.is_step_free = true
        and s.has_curb_cuts = true
      then 'full'
      when s.smoothness        is null
        and s.is_step_free     is null
        and s.has_curb_cuts    is null
        and s.has_tactile_paving is null
        and s.is_obstacle_free is null
      then 'unknown'
      else 'partial'
    end as rating,
    s.field_sources,
    ST_AsGeoJSON(s.geom) as geojson
  from street_segments s
  where s.geom && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326);
$$;

grant execute on function segments_in_bbox(
  double precision, double precision, double precision, double precision
) to anon, authenticated;
