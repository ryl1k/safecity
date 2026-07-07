-- Update segments_in_bbox() with revised rating logic:
--
-- none    → bad surface type OR smoothness intermediate+ OR has stairs
-- full    → smoothness good/excellent AND step-free AND curb cuts
-- unknown → no accessibility data at all (smoothness, step-free, curb cuts all NULL)
-- partial → everything else

-- This function body reads street_segments.smoothness and .field_sources. Those
-- columns are added by 0019/0020, which sort AFTER this file — so on a fresh build
-- they don't exist yet and the CREATE fails (42703). Add them here idempotently
-- (0019/0020 repeat the same `if not exists` add, so the final schema is unchanged).
-- Ordering only became an issue once these segment migrations and the b2b ones
-- (which reused numbers 0017/0021/0022) landed in one tree via the #17 merge.
alter table street_segments add column if not exists smoothness text;
alter table street_segments add column if not exists field_sources jsonb not null default '{}'::jsonb;

-- Return-type changes (new columns) can't go through CREATE OR REPLACE — drop first,
-- matching the pattern in 0019/0020/0021. Without this the fresh-schema build fails
-- with 42P13 ("cannot change return type of existing function").
drop function if exists segments_in_bbox(double precision, double precision, double precision, double precision);

create or replace function segments_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
returns table (
  id               text,
  street_name      text,
  sidewalk_width_m double precision,
  surface_type     text,
  smoothness       text,
  incline_percent  double precision,
  has_tactile_paving boolean,
  is_step_free     boolean,
  has_curb_cuts    boolean,
  has_ramp         boolean,
  lit              boolean,
  verify_status    text,
  rating           text,
  field_sources    jsonb,
  geojson          text
)
language sql stable
as $$
  select
    s.id::text,
    s.street_name,
    s.sidewalk_width_m,
    s.surface_type,
    s.smoothness,
    s.incline_percent,
    s.has_tactile_paving,
    s.is_step_free,
    s.has_curb_cuts,
    s.has_ramp,
    s.lit,
    s.verify_status::text,
    case
      -- ── none ──────────────────────────────────────────────────────────────
      -- Surfaces that are inherently inaccessible regardless of other fields.
      when s.surface_type in (
        'grass', 'ground', 'dirt', 'mud', 'sand', 'earth', 'rock', 'unpaved'
      ) then 'none'

      -- Poor smoothness makes the path inaccessible.
      when s.smoothness in (
        'intermediate', 'bad', 'very_bad', 'horrible', 'very_horrible', 'impassable'
      ) then 'none'

      -- Stairs present → never accessible.
      when s.is_step_free = false then 'none'

      -- ── full ──────────────────────────────────────────────────────────────
      -- Good surface quality + confirmed step-free + lowered kerb.
      when s.smoothness in ('excellent', 'good')
        and s.is_step_free = true
        and s.has_curb_cuts = true
      then 'full'

      -- ── unknown ───────────────────────────────────────────────────────────
      -- No accessibility data at all — only geometry/name from OSM.
      when s.smoothness        is null
        and s.is_step_free     is null
        and s.has_curb_cuts    is null
        and s.has_tactile_paving is null
      then 'unknown'

      -- ── partial ───────────────────────────────────────────────────────────
      -- Has some positive signals (e.g. step-free but smoothness unknown,
      -- or good smoothness but no curb-cut data yet).
      else 'partial'
    end as rating,
    s.field_sources,
    ST_AsGeoJSON(s.geom) as geojson
  from street_segments s
  where s.geom && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326);
$$;

grant execute on function segments_in_bbox(
  double precision, double precision, double precision, double precision
) to anon, authenticated;
