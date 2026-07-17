-- Add ai_reason to both tables so Groq's validation result is stored permanently.
alter table points add column if not exists ai_reason text not null default '';
alter table street_segments add column if not exists ai_reason text not null default '';

-- Recreate add_point with the new p_ai_reason parameter.
create or replace function add_point(
  p_name text,
  p_category point_category,
  p_lng double precision,
  p_lat double precision,
  p_address text,
  p_description text,
  p_features jsonb,
  p_photos text[] default '{}',
  p_ai_reason text default ''
)
returns uuid
language plpgsql
security invoker
as $$
declare
  new_id uuid;
begin
  if not is_business_user(auth.uid())
     and (select count(*) from points where created_by = auth.uid()) >= 10 then
    raise exception 'point limit reached' using errcode = 'PT001';
  end if;

  insert into points (name, category, geom, address, description, photos, ai_reason, source, verify_status, created_by)
  values (
    p_name, p_category,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_address, p_description, coalesce(p_photos, '{}'), coalesce(p_ai_reason, ''), 'crowdsourced', 'unverified', auth.uid()
  )
  returning id into new_id;

  insert into point_feature_values (point_id, feature_key, value, reported_by)
  select new_id, t.key, (t.val)::feature_value, auth.uid()
  from jsonb_each_text(p_features) as t(key, val)
  where t.val in ('yes', 'no', 'unknown');

  return new_id;
end;
$$;
grant execute on function add_point(text, point_category, double precision, double precision, text, text, jsonb, text[], text) to authenticated;

-- Update point_detail to return ai_reason.
drop function if exists point_detail(uuid);
create function point_detail(p_id uuid)
returns table (
  id uuid, name text, category point_category, address text, description text, photos text[],
  lng double precision, lat double precision, verify_status verify_status, features jsonb,
  is_business boolean, verified_paid boolean, subscription_active boolean,
  gov_rating real, rating_authority text, kind text, source_url text, checked_on date,
  ai_reason text
)
language sql stable as $$
  select
    p.id, p.name, p.category, p.address, p.description, p.photos,
    ST_X(p.geom::geometry), ST_Y(p.geom::geometry), p.verify_status,
    coalesce((select jsonb_object_agg(fv.feature_key, fv.value::text)
              from point_feature_values fv where fv.point_id = p.id), '{}'::jsonb),
    b.biz, b.biz, b.biz,
    p.gov_rating, p.rating_authority, p.kind, p.source_url, p.checked_on,
    p.ai_reason
  from points p
  cross join lateral (select is_business_user(p.created_by) as biz) b
  where p.id = p_id;
$$;
grant execute on function point_detail(uuid) to anon, authenticated;
