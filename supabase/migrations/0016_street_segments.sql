-- Street segments: sidewalk accessibility data for line geometries.
-- Each row is one surveyed walking path. A single physical street can have
-- multiple rows (e.g. one per sidewalk if they differ in quality).

create table street_segments (
  id                 uuid primary key default gen_random_uuid(),
  geom               geometry(LineString, 4326) not null,
  osm_way_id         bigint,
  street_name        text not null,
  sidewalk_width_m   numeric(4,2),
  surface_type       text,                -- 'asphalt','cobblestone','paving_stones',…
  incline_percent    numeric(5,2),
  has_tactile_paving boolean,
  is_step_free       boolean,
  has_curb_cuts      boolean,
  has_ramp           boolean,
  lit                boolean,
  verify_status      verify_status not null default 'unverified',
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index street_segments_geom_idx on street_segments using gist (geom);

alter table street_segments enable row level security;
create policy "public read segments"  on street_segments for select using (true);
create policy "owner write segments"  on street_segments for all
  using (auth.uid() = created_by);

-- BBox query used by the map. Returns a computed `rating` and the geometry
-- as a GeoJSON string so callers can build a FeatureCollection directly.
create or replace function segments_in_bbox(
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
    s.verify_status::text,
    case
      when s.is_step_free
           and coalesce(s.sidewalk_width_m, 0) >= 1.8
           and coalesce(s.has_curb_cuts, false)
        then 'full'
      when s.is_step_free
           and coalesce(s.sidewalk_width_m, 0) >= 1.0
        then 'partial'
      when s.is_step_free = false
        then 'none'
      else 'unknown'
    end as rating,
    ST_AsGeoJSON(s.geom) as geojson
  from street_segments s
  where s.geom && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326);
$$;

grant execute on function segments_in_bbox(
  double precision, double precision, double precision, double precision
) to anon, authenticated;

-- ── Mock data: three real Lviv streets ──────────────────────────────────────

-- Проспект Свободи — wide pedestrian boulevard, fully accessible
insert into street_segments
  (street_name, geom, sidewalk_width_m, surface_type, incline_percent,
   has_tactile_paving, is_step_free, has_curb_cuts, has_ramp, lit, verify_status)
values
  ('Проспект Свободи',
   ST_GeomFromText(
     'LINESTRING(24.0294 49.8433,24.0300 49.8425,24.0308 49.8415,24.0316 49.8405)',
     4326),
   3.5, 'paving_stones', 0.8,
   true, true, true, true, true, 'verified');

-- Вулиця Городоцька — narrow old-town cobblestone, not accessible
insert into street_segments
  (street_name, geom, sidewalk_width_m, surface_type, incline_percent,
   has_tactile_paving, is_step_free, has_curb_cuts, has_ramp, lit, verify_status)
values
  ('Вулиця Городоцька',
   ST_GeomFromText(
     'LINESTRING(24.0098 49.8388,24.0130 49.8386,24.0165 49.8384,24.0200 49.8382)',
     4326),
   1.1, 'cobblestone', 1.2,
   false, false, false, false, true, 'unverified');

-- Вулиця Лесі Українки — step-free but no tactile paving, partial access
insert into street_segments
  (street_name, geom, sidewalk_width_m, surface_type, incline_percent,
   has_tactile_paving, is_step_free, has_curb_cuts, has_ramp, lit, verify_status)
values
  ('Вулиця Лесі Українки',
   ST_GeomFromText(
     'LINESTRING(24.0395 49.8350,24.0420 49.8358,24.0448 49.8365,24.0472 49.8372)',
     4326),
   1.8, 'asphalt', 3.5,
   false, true, true, false, true, 'unverified');
