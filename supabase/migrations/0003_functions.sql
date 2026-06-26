-- Geo read RPCs. Each returns points + their feature values (jsonb) so the client
-- computes the per-profile traffic-light via the shared rules engine in ONE call.

create or replace function points_near(
  lng double precision,
  lat double precision,
  radius_m double precision default 1500
)
returns table (
  id uuid,
  name text,
  category point_category,
  address text,
  lng double precision,
  lat double precision,
  verify_status verify_status,
  distance_m double precision,
  features jsonb
)
language sql
stable
as $$
  select
    p.id, p.name, p.category, p.address,
    ST_X(p.geom::geometry) as lng,
    ST_Y(p.geom::geometry) as lat,
    p.verify_status,
    ST_Distance(p.geom, ST_MakePoint(lng, lat)::geography) as distance_m,
    coalesce(
      (select jsonb_object_agg(fv.feature_key, fv.value::text)
         from point_feature_values fv where fv.point_id = p.id),
      '{}'::jsonb
    ) as features
  from points p
  where ST_DWithin(p.geom, ST_MakePoint(lng, lat)::geography, radius_m)
  order by distance_m;
$$;

create or replace function points_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
returns table (
  id uuid,
  name text,
  category point_category,
  address text,
  lng double precision,
  lat double precision,
  verify_status verify_status,
  features jsonb
)
language sql
stable
as $$
  select
    p.id, p.name, p.category, p.address,
    ST_X(p.geom::geometry) as lng,
    ST_Y(p.geom::geometry) as lat,
    p.verify_status,
    coalesce(
      (select jsonb_object_agg(fv.feature_key, fv.value::text)
         from point_feature_values fv where fv.point_id = p.id),
      '{}'::jsonb
    ) as features
  from points p
  where p.geom::geometry && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326);
$$;

grant execute on function points_near(double precision, double precision, double precision) to anon, authenticated;
grant execute on function points_in_bbox(double precision, double precision, double precision, double precision) to anon, authenticated;
