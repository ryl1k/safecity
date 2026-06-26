-- Insert a crowdsourced point + its feature values in one call (handles PostGIS geom).
-- security invoker → RLS still applies; auth.uid() is the contributor.
create or replace function add_point(
  p_name text,
  p_category point_category,
  p_lng double precision,
  p_lat double precision,
  p_address text,
  p_features jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  new_id uuid;
begin
  insert into points (name, category, geom, address, source, verify_status, created_by)
  values (
    p_name, p_category,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_address, 'crowdsourced', 'unverified', auth.uid()
  )
  returning id into new_id;

  insert into point_feature_values (point_id, feature_key, value, reported_by)
  select new_id, t.key, (t.val)::feature_value, auth.uid()
  from jsonb_each_text(p_features) as t(key, val)
  where t.val in ('yes', 'no', 'unknown');

  return new_id;
end;
$$;

grant execute on function add_point(text, point_category, double precision, double precision, text, jsonb) to authenticated;
