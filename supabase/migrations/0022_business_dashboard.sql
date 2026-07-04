-- B2B dashboard: point view analytics + owner edit/delete of their own points.

-- View analytics: incremented (privileged) each time a point detail is fetched.
alter table points add column if not exists view_count integer not null default 0;

-- update_point: owner edits their own point (name/category/location/address/
-- description + full feature set). SECURITY DEFINER with an explicit owner check
-- so it can replace point_feature_values without tripping their RLS; auth.uid()
-- still resolves to the caller inside a definer function. PT404 → ErrNotFound.
create or replace function update_point(
  p_id uuid,
  p_name text,
  p_category point_category,
  p_lng double precision,
  p_lat double precision,
  p_address text,
  p_description text,
  p_features jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from points where id = p_id and created_by = auth.uid()) then
    raise exception 'point not owned by caller' using errcode = 'PT404';
  end if;
  update points set
    name = p_name,
    category = p_category,
    geom = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    address = p_address,
    description = p_description,
    updated_at = now()
  where id = p_id;
  delete from point_feature_values where point_id = p_id;
  insert into point_feature_values (point_id, feature_key, value, reported_by)
  select p_id, t.key, (t.val)::feature_value, auth.uid()
  from jsonb_each_text(p_features) as t(key, val)
  where t.val in ('yes', 'no', 'unknown');
end;
$$;
grant execute on function update_point(uuid, text, point_category, double precision, double precision, text, text, jsonb) to authenticated;

-- delete_point: owner removes their own point (features/confirmations cascade).
create or replace function delete_point(p_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from points where id = p_id and created_by = auth.uid()) then
    raise exception 'point not owned by caller' using errcode = 'PT404';
  end if;
  delete from points where id = p_id;
end;
$$;
grant execute on function delete_point(uuid) to authenticated;
