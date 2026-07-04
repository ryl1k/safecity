-- Per-field provenance for street_segments, so the tiered fill pipeline
-- (OSM geometry+surface → DEM incline → gov «Мапа безбар'єрності» criteria →
-- future user surveys) can record WHERE each value came from and surface an
-- honest confidence to users. It also keeps OSM-origin (ODbL) and non-OSM values
-- separable per field rather than silently merged into one dataset.
--
-- field_sources maps entity field → source: 'osm' | 'dem' | 'gov' | 'user'
-- (rough confidence order: user > gov > osm > dem). A field absent from the map
-- is unknown.

alter table street_segments add column if not exists field_sources jsonb not null default '{}'::jsonb;

-- Backfill: every value present today came from the OSM sidewalk importer.
update street_segments set field_sources =
    (case when surface_type       is not null then jsonb_build_object('surface','osm')    else '{}'::jsonb end)
  ||(case when smoothness         is not null then jsonb_build_object('smoothness','osm') else '{}'::jsonb end)
  ||(case when sidewalk_width_m   is not null then jsonb_build_object('width','osm')      else '{}'::jsonb end)
  ||(case when incline_percent    is not null then jsonb_build_object('incline','osm')    else '{}'::jsonb end)
  ||(case when is_step_free       is not null then jsonb_build_object('step_free','osm')  else '{}'::jsonb end)
  ||(case when has_curb_cuts      is not null then jsonb_build_object('curb_cuts','osm')  else '{}'::jsonb end)
  ||(case when has_tactile_paving is not null then jsonb_build_object('tactile','osm')    else '{}'::jsonb end)
  ||(case when has_ramp           is not null then jsonb_build_object('ramp','osm')       else '{}'::jsonb end)
  ||(case when lit                is not null then jsonb_build_object('lit','osm')        else '{}'::jsonb end)
where osm_way_id is not null;

-- Re-expose segments_in_bbox with field_sources appended (OUT columns changed → drop+recreate).
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
  field_sources      jsonb,
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
    s.field_sources,
    ST_AsGeoJSON(s.geom)
  from street_segments s
  where s.geom && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326);
$$;

grant execute on function segments_in_bbox(
  double precision, double precision, double precision, double precision
) to anon, authenticated;
