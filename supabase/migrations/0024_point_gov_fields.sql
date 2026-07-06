-- Enrich points with the "Мапа безбар'єрності" monitoring fields so the national
-- seed carries the dataset's own authoritative signal, not just our lossy feature
-- map. All additive — no existing column changes.
--   gov_rating       0..1 barrier-free monitoring score (the dataset's headline)
--   rating_authority who assessed it (міськрада, …; 'невідомо' when unknown)
--   kind             the specific gov subtype (Аптеки, Медицина, Вокзали, …)
--   source_url       lun.ua barrier-free page (provenance)
--   checked_on       assessment date (dataset updateDate)

alter table points add column if not exists gov_rating       real;
alter table points add column if not exists rating_authority text;
alter table points add column if not exists kind             text;
alter table points add column if not exists source_url       text;
alter table points add column if not exists checked_on       date;

-- point_detail now returns the new fields for the detail page. Same is_business
-- derivation as 0021 (owner's account status).
drop function if exists point_detail(uuid);
create function point_detail(p_id uuid)
returns table (
  id uuid, name text, category point_category, address text, description text, photos text[],
  lng double precision, lat double precision, verify_status verify_status, features jsonb,
  is_business boolean, verified_paid boolean, subscription_active boolean,
  gov_rating real, rating_authority text, kind text, source_url text, checked_on date
)
language sql stable as $$
  select
    p.id, p.name, p.category, p.address, p.description, p.photos,
    ST_X(p.geom::geometry), ST_Y(p.geom::geometry), p.verify_status,
    coalesce((select jsonb_object_agg(fv.feature_key, fv.value::text)
              from point_feature_values fv where fv.point_id = p.id), '{}'::jsonb),
    b.biz, b.biz, b.biz,
    p.gov_rating, p.rating_authority, p.kind, p.source_url, p.checked_on
  from points p
  cross join lateral (select is_business_user(p.created_by) as biz) b
  where p.id = p_id;
$$;
grant execute on function point_detail(uuid) to anon, authenticated;

-- Geo RPCs: same return shape as 0021 (Go scan unchanged) but add a payload cap so
-- a full zoom-out over the ~56k nationwide points can't return everything in one
-- request. bbox keeps the best-rated points when capped; near stays nearest-first.
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
  where p.geom::geometry && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  order by p.gov_rating desc nulls last
  limit 5000;
$$;
grant execute on function points_in_bbox(double precision, double precision, double precision, double precision) to anon, authenticated;

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
  order by distance_m
  limit 5000;
$$;
grant execute on function points_near(double precision, double precision, double precision) to anon, authenticated;
