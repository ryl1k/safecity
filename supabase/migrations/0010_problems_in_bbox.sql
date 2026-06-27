-- Problems as a map layer (KB 07). Returns each problem's location, taking the
-- problem's own dropped pin when present, otherwise the attached point's geometry.

create or replace function problems_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
returns table (
  id uuid,
  title text,
  status problem_status,
  severity int,
  confirmations int,
  lng double precision,
  lat double precision
)
language sql
stable
as $$
  select
    pr.id, pr.title, pr.status, pr.severity, pr.confirmations,
    ST_X(coalesce(pr.geom, pt.geom)::geometry) as lng,
    ST_Y(coalesce(pr.geom, pt.geom)::geometry) as lat
  from problems pr
  left join points pt on pt.id = pr.point_id
  where pr.status <> 'resolved'
    and coalesce(pr.geom, pt.geom) is not null
    and coalesce(pr.geom, pt.geom)::geometry
        && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326);
$$;

grant execute on function problems_in_bbox(double precision, double precision, double precision, double precision) to anon, authenticated;
