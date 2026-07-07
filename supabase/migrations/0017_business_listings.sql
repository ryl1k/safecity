-- Business listings: self-serve B2B points. Businesses can only add NEW points
-- (no claiming existing crowdsourced points) — see the store/CreateBusinessPoint
-- Go code, which always inserts a fresh point alongside this row.

create table business_listings (
  point_id               uuid primary key references points(id) on delete cascade,
  owner_id               uuid not null references auth.users(id) on delete cascade,
  verified_paid          boolean not null default false,
  verified_paid_at        timestamptz,
  subscription_status    text not null default 'none', -- none | active | expired
  subscription_plan      text,                          -- monthly | yearly
  subscription_renews_at timestamptz,
  created_at             timestamptz not null default now()
);

alter table business_listings enable row level security;
create policy read_all      on business_listings for select using (true);
create policy owner_insert  on business_listings for insert to authenticated with check (auth.uid() = owner_id);
create policy owner_update  on business_listings for update to authenticated using (auth.uid() = owner_id);
create policy mod_update    on business_listings for update to authenticated using (is_moderator());

-- owner_update lets the owner flip their own verified_paid/subscription_* fields —
-- acceptable ONLY because payment is mocked right now (no money involved; see the
-- MOCK-labeled handlers in internal/server/business.go). When a real payment
-- processor is wired in, these writes must move behind a payment-webhook handler
-- instead of a client-callable owner update.

-- ── Public visibility of business status ────────────────────────────────────
-- Extend the geo read RPCs with business flags so the web can render a small
-- "Верифіковано" / business badge — otherwise paying for verification has no
-- visible payoff anywhere except the owner's own dashboard.

drop function if exists points_near(double precision, double precision, double precision);

create function points_near(
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
  features jsonb,
  is_business boolean,
  verified_paid boolean,
  subscription_active boolean
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
    ) as features,
    bl.point_id is not null as is_business,
    coalesce(bl.verified_paid, false) as verified_paid,
    coalesce(bl.subscription_status = 'active', false) as subscription_active
  from points p
  left join business_listings bl on bl.point_id = p.id
  where ST_DWithin(p.geom, ST_MakePoint(lng, lat)::geography, radius_m)
  order by distance_m;
$$;

grant execute on function points_near(double precision, double precision, double precision) to anon, authenticated;

drop function if exists points_in_bbox(double precision, double precision, double precision, double precision);

create function points_in_bbox(
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
  features jsonb,
  is_business boolean,
  verified_paid boolean,
  subscription_active boolean
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
    ) as features,
    bl.point_id is not null as is_business,
    coalesce(bl.verified_paid, false) as verified_paid,
    coalesce(bl.subscription_status = 'active', false) as subscription_active
  from points p
  left join business_listings bl on bl.point_id = p.id
  where p.geom::geometry && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326);
$$;

grant execute on function points_in_bbox(double precision, double precision, double precision, double precision) to anon, authenticated;

drop function if exists point_detail(uuid);

create function point_detail(p_id uuid)
returns table (
  id uuid,
  name text,
  category point_category,
  address text,
  description text,
  photos text[],
  lng double precision,
  lat double precision,
  verify_status verify_status,
  features jsonb,
  is_business boolean,
  verified_paid boolean,
  subscription_active boolean
)
language sql
stable
as $$
  select
    p.id, p.name, p.category, p.address, p.description, p.photos,
    ST_X(p.geom::geometry) as lng,
    ST_Y(p.geom::geometry) as lat,
    p.verify_status,
    coalesce(
      (select jsonb_object_agg(fv.feature_key, fv.value::text)
         from point_feature_values fv where fv.point_id = p.id),
      '{}'::jsonb
    ) as features,
    bl.point_id is not null as is_business,
    coalesce(bl.verified_paid, false) as verified_paid,
    coalesce(bl.subscription_status = 'active', false) as subscription_active
  from points p
  left join business_listings bl on bl.point_id = p.id
  where p.id = p_id;
$$;

grant execute on function point_detail(uuid) to anon, authenticated;
