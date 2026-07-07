-- SafeCity schema — entities from KB 04 (Points), 06 (CV problems n/a), 07 (Civic), 08 (Accounts).
-- Tables are plural to avoid clashing with the built-in `point` geometric type.

create extension if not exists postgis;

-- ── Enums ──────────────────────────────────────────────────────────────────
create type profile_type    as enum ('wheelchair', 'blind');
create type point_category  as enum ('venue', 'transit', 'crossing', 'toilet', 'parking');
create type feature_value   as enum ('yes', 'no', 'unknown');
create type verify_status   as enum ('unverified', 'verified', 'official');
create type point_source    as enum ('imported', 'crowdsourced', 'official');
create type problem_status   as enum ('reported', 'confirmed', 'escalated', 'resolved');
create type petition_scope  as enum ('internal', 'official');
create type user_role       as enum ('user', 'trusted', 'moderator');

-- ── Accounts / accessibility profile (KB 03, 08) ───────────────────────────
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         user_role not null default 'user',
  needs        profile_type[] not null default '{}',
  primary_need profile_type,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Accessibility feature catalog (KB 04) ──────────────────────────────────
create table accessibility_features (
  key        text primary key,
  label      text not null,
  profile    profile_type not null,
  categories point_category[] not null default '{}',
  critical   boolean not null default false,
  value_type text not null default 'bool',
  unit       text
);

-- ── Points (KB 04) ─────────────────────────────────────────────────────────
create table points (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      point_category not null,
  geom          geography(Point, 4326) not null,
  address       text,
  photos        text[] not null default '{}',
  source        point_source not null default 'crowdsourced',
  verify_status verify_status not null default 'unverified',
  osm_id        text,                 -- external ref for future two-way OSM (KB 09)
  opening_hours text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index points_geom_idx     on points using gist (geom);
create index points_category_idx on points (category);
create index points_verify_idx   on points (verify_status);

create table point_feature_values (
  id          uuid primary key default gen_random_uuid(),
  point_id    uuid not null references points(id) on delete cascade,
  feature_key text not null references accessibility_features(key),
  value       feature_value not null default 'unknown',
  detail      jsonb,
  reported_by uuid references auth.users(id) on delete set null,
  reported_at timestamptz not null default now(),
  unique (point_id, feature_key)
);
create index pfv_point_idx on point_feature_values (point_id);

create table reviews (
  id         uuid primary key default gen_random_uuid(),
  point_id   uuid not null references points(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  profile    profile_type not null,
  stars      int not null check (stars between 1 and 5),
  text       text,
  photos     text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (point_id, user_id, profile)
);
create index reviews_point_idx on reviews (point_id);

-- ── Civic loop (KB 07) ─────────────────────────────────────────────────────
create table problems (
  id            uuid primary key default gen_random_uuid(),
  point_id      uuid references points(id) on delete set null,
  geom          geography(Point, 4326),
  category      point_category,
  title         text not null,
  description   text,
  severity      int not null default 1 check (severity between 1 and 3),
  status        problem_status not null default 'reported',
  confirmations int not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  check (point_id is not null or geom is not null)   -- attach to a point OR a dropped pin
);
create index problems_geom_idx   on problems using gist (geom);
create index problems_status_idx on problems (status);

create table problem_confirmations (
  problem_id uuid not null references problems(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (problem_id, user_id)
);

create table petitions (
  id                       uuid primary key default gen_random_uuid(),
  problem_id               uuid not null references problems(id) on delete cascade,
  scope                    petition_scope not null default 'internal',
  title                    text not null,
  body                     text,
  official_url             text,
  internal_signatures      int not null default 0,
  official_signature_count int,
  status                   text not null default 'open',
  created_by               uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now()
);

create table petition_signatures (
  petition_id uuid not null references petitions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (petition_id, user_id)
);
