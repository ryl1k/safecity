-- Single-point lookup with coords + features (for detail + routing destination).
create or replace function point_detail(p_id uuid)
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
  where p.id = p_id;
$$;

grant execute on function point_detail(uuid) to anon, authenticated;
