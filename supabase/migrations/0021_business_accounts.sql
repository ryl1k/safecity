-- Account-level B2B. A user is a "business" (unlimited points + verified/priority
-- perks on ALL their points) while they hold an active business subscription.
-- This replaces the per-point business_listings model as the source of business
-- status. Regular users are capped at 10 points, enforced server-side in add_point.
-- Payments are MOCKED for now (self-serve owner writes); a real processor later
-- must move these behind a payment-webhook instead of client-callable updates.

create table if not exists business_accounts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  active     boolean not null default false,
  plan       text,                      -- monthly | yearly
  renews_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table business_accounts enable row level security;
create policy read_all     on business_accounts for select using (true);
create policy owner_insert on business_accounts for insert to authenticated with check (auth.uid() = user_id);
create policy owner_update on business_accounts for update to authenticated using (auth.uid() = user_id);

-- True while the user holds an active, non-expired subscription. SECURITY DEFINER
-- so add_point's cap check and the geo RPCs can read it regardless of caller RLS.
create or replace function is_business_user(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from business_accounts ba
    where ba.user_id = p_uid and ba.active
      and (ba.renews_at is null or ba.renews_at > now())
  );
$$;
grant execute on function is_business_user(uuid) to anon, authenticated;

-- add_point now enforces the 10-point cap for non-business users. The limit is
-- deliberately NOT surfaced anywhere until it is hit — the client shows a toast on
-- this error. SQLSTATE 'PT001' → store.ErrPointLimit → HTTP 409.
create or replace function add_point(
  p_name text,
  p_category point_category,
  p_lng double precision,
  p_lat double precision,
  p_address text,
  p_description text,
  p_features jsonb,
  p_photos text[] default '{}'
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

  insert into points (name, category, geom, address, description, photos, source, verify_status, created_by)
  values (
    p_name, p_category,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_address, p_description, coalesce(p_photos, '{}'), 'crowdsourced', 'unverified', auth.uid()
  )
  returning id into new_id;

  insert into point_feature_values (point_id, feature_key, value, reported_by)
  select new_id, t.key, (t.val)::feature_value, auth.uid()
  from jsonb_each_text(p_features) as t(key, val)
  where t.val in ('yes', 'no', 'unknown');

  return new_id;
end;
$$;
grant execute on function add_point(text, point_category, double precision, double precision, text, text, jsonb, text[]) to authenticated;

-- Re-point the geo RPCs' business flags at the OWNER's account status instead of
-- per-point business_listings (drop+recreate; same return shape as 0017).
drop function if exists points_near(double precision, double precision, double precision);
create function points_near(
  lng double precision, lat double precision, radius_m double precision default 1500
)
returns table (
  id uuid, name text, category point_category, address text,
  lng double precision, lat double precision, verify_status verify_status,
  distance_m double precision, features jsonb,
  is_business boolean, verified_paid boolean, subscription_active boolean
)
language sql stable as $$
  select
    p.id, p.name, p.category, p.address,
    ST_X(p.geom::geometry), ST_Y(p.geom::geometry), p.verify_status,
    ST_Distance(p.geom, ST_MakePoint(lng, lat)::geography) as distance_m,
    coalesce((select jsonb_object_agg(fv.feature_key, fv.value::text)
              from point_feature_values fv where fv.point_id = p.id), '{}'::jsonb),
    b.biz, b.biz, b.biz
  from points p
  cross join lateral (select is_business_user(p.created_by) as biz) b
  where ST_DWithin(p.geom, ST_MakePoint(lng, lat)::geography, radius_m)
  order by distance_m;
$$;
grant execute on function points_near(double precision, double precision, double precision) to anon, authenticated;

drop function if exists points_in_bbox(double precision, double precision, double precision, double precision);
create function points_in_bbox(
  min_lng double precision, min_lat double precision, max_lng double precision, max_lat double precision
)
returns table (
  id uuid, name text, category point_category, address text,
  lng double precision, lat double precision, verify_status verify_status, features jsonb,
  is_business boolean, verified_paid boolean, subscription_active boolean
)
language sql stable as $$
  select
    p.id, p.name, p.category, p.address,
    ST_X(p.geom::geometry), ST_Y(p.geom::geometry), p.verify_status,
    coalesce((select jsonb_object_agg(fv.feature_key, fv.value::text)
              from point_feature_values fv where fv.point_id = p.id), '{}'::jsonb),
    b.biz, b.biz, b.biz
  from points p
  cross join lateral (select is_business_user(p.created_by) as biz) b
  where p.geom::geometry && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326);
$$;
grant execute on function points_in_bbox(double precision, double precision, double precision, double precision) to anon, authenticated;

drop function if exists point_detail(uuid);
create function point_detail(p_id uuid)
returns table (
  id uuid, name text, category point_category, address text, description text, photos text[],
  lng double precision, lat double precision, verify_status verify_status, features jsonb,
  is_business boolean, verified_paid boolean, subscription_active boolean
)
language sql stable as $$
  select
    p.id, p.name, p.category, p.address, p.description, p.photos,
    ST_X(p.geom::geometry), ST_Y(p.geom::geometry), p.verify_status,
    coalesce((select jsonb_object_agg(fv.feature_key, fv.value::text)
              from point_feature_values fv where fv.point_id = p.id), '{}'::jsonb),
    b.biz, b.biz, b.biz
  from points p
  cross join lateral (select is_business_user(p.created_by) as biz) b
  where p.id = p_id;
$$;
grant execute on function point_detail(uuid) to anon, authenticated;
