-- Add a free-text description to points; thread it through the RPCs.
alter table points add column if not exists description text;

-- add_point now takes p_description (drop the old 6-arg overload to avoid ambiguity).
drop function if exists add_point(text, point_category, double precision, double precision, text, jsonb);

create or replace function add_point(
  p_name text,
  p_category point_category,
  p_lng double precision,
  p_lat double precision,
  p_address text,
  p_description text,
  p_features jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  new_id uuid;
begin
  insert into points (name, category, geom, address, description, source, verify_status, created_by)
  values (
    p_name, p_category,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_address, p_description, 'crowdsourced', 'unverified', auth.uid()
  )
  returning id into new_id;

  insert into point_feature_values (point_id, feature_key, value, reported_by)
  select new_id, t.key, (t.val)::feature_value, auth.uid()
  from jsonb_each_text(p_features) as t(key, val)
  where t.val in ('yes', 'no', 'unknown');

  return new_id;
end;
$$;
grant execute on function add_point(text, point_category, double precision, double precision, text, text, jsonb) to authenticated;

-- point_detail now returns description (must drop: return shape changes).
drop function if exists point_detail(uuid);

create function point_detail(p_id uuid)
returns table (
  id uuid,
  name text,
  category point_category,
  address text,
  description text,
  lng double precision,
  lat double precision,
  verify_status verify_status,
  features jsonb
)
language sql
stable
as $$
  select
    p.id, p.name, p.category, p.address, p.description,
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
