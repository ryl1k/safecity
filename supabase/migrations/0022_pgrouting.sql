-- pgRouting: accessible turn-by-turn routing on our street_segments graph.
--
-- Design: each segment gets an integer seg_id (required by pgRouting), plus
-- source/target vertex IDs built by pgr_createTopology. Routing cost is the
-- physical length multiplied by an accessibility weight from segment_rating():
--   full    → 1.0×   (prefer these)
--   partial → 1.5×
--   unknown → 3.0×   (missing data, better than blocked)
--   none    → 100.0× (impassable — high cost, not infinity, to allow escape)
--
-- The route_accessible() function is exposed as a Supabase RPC and called by
-- the Go API, which falls back to ORS when pgRouting has no path.

-- 1. Extension ----------------------------------------------------------------
create extension if not exists pgrouting;

-- 2. Routing topology columns -------------------------------------------------
-- seg_id: stable integer ID required by pgr_createTopology (UUID is not
-- accepted). bigserial auto-populates existing rows.
alter table street_segments
  add column if not exists seg_id  bigserial,
  add column if not exists source  integer,
  add column if not exists target  integer;

create index if not exists street_segments_source_idx on street_segments (source);
create index if not exists street_segments_target_idx on street_segments (target);

-- 3. Build topology -----------------------------------------------------------
-- Snaps linestring endpoints within 0.0001 degrees (~11 m) to the same vertex.
-- Populates street_segments.source / .target and creates the
-- street_segments_vertices_pgr table.
select pgr_createTopology(
  'street_segments',
  0.0001,          -- tolerance in degrees
  'geom',          -- geometry column
  'seg_id',        -- edge id column
  'source',        -- source vertex column (will be written)
  'target'         -- target vertex column (will be written)
);

-- 4. Accessibility cost -------------------------------------------------------
-- Returns cost in metres adjusted for wheelchair accessibility.
create or replace function segment_cost(
  p_surface    text,
  p_smoothness text,
  p_width      numeric,
  p_incline    numeric,
  p_step_free  boolean,
  p_length_m   double precision
)
returns double precision
language sql immutable
as $$
  select p_length_m * case
    segment_rating(p_surface, p_smoothness, p_width, p_incline, p_step_free)
    when 'full'    then 1.0
    when 'partial' then 1.5
    when 'none'    then 100.0
    else                3.0   -- unknown
  end
$$;

grant execute on function segment_cost(text, text, numeric, numeric, boolean, double precision)
  to anon, authenticated;

-- 5. Accessible routing RPC ---------------------------------------------------
-- Returns JSON: {coordinates: [[lng,lat],...], distance_m: float, rating_summary: {…}}
-- or {error: string} when no path exists.
--
-- Uses pgr_dijkstra (undirected) with per-segment cost from segment_cost().
-- Coordinates are the raw linestring points from each edge in path order, so
-- the client gets a polyline it can render directly.
create or replace function route_accessible(
  start_lng double precision,
  start_lat double precision,
  end_lng   double precision,
  end_lat   double precision
)
returns json
language plpgsql
stable
security definer
as $$
declare
  v_start    integer;
  v_end      integer;
  v_result   json;
begin
  -- Nearest topology vertex to start point (KNN via <->)
  select id into v_start
  from street_segments_vertices_pgr
  order by the_geom <-> ST_SetSRID(ST_MakePoint(start_lng, start_lat), 4326)
  limit 1;

  -- Nearest topology vertex to end point
  select id into v_end
  from street_segments_vertices_pgr
  order by the_geom <-> ST_SetSRID(ST_MakePoint(end_lng, end_lat), 4326)
  limit 1;

  if v_start is null or v_end is null then
    return '{"error":"no_graph_near_points"}'::json;
  end if;

  -- Dijkstra → join edges → extract coordinates
  with
  dijkstra as (
    select *
    from pgr_dijkstra(
      $sql$
        select
          seg_id::bigint as id,
          source,
          target,
          segment_cost(surface_type, smoothness, sidewalk_width_m,
                       incline_percent, is_step_free,
                       st_length(geom::geography)) as cost,
          segment_cost(surface_type, smoothness, sidewalk_width_m,
                       incline_percent, is_step_free,
                       st_length(geom::geography)) as reverse_cost
        from street_segments
        where source is not null and target is not null
      $sql$,
      v_start, v_end,
      directed := false
    )
  ),
  path_edges as (
    select
      d.seq,
      d.edge,
      ss.geom,
      segment_rating(ss.surface_type, ss.smoothness, ss.sidewalk_width_m,
                     ss.incline_percent, ss.is_step_free) as rating,
      st_length(ss.geom::geography)                        as length_m
    from dijkstra d
    join street_segments ss on ss.seg_id = d.edge
    where d.edge <> -1
    order by d.seq
  ),
  -- Dump every vertex of each edge in path order
  coords as (
    select
      pe.seq,
      (st_dumppoints(pe.geom)).path[1] as pt_idx,
      (st_dumppoints(pe.geom)).geom    as pt
    from path_edges pe
  ),
  coord_list as (
    select jsonb_build_array(
             round(st_x(pt)::numeric, 7),
             round(st_y(pt)::numeric, 7)
           ) as coord
    from coords
    order by seq, pt_idx
  ),
  totals as (
    select
      coalesce(sum(length_m), 0)  as distance_m,
      coalesce(sum(case when rating = 'full'    then length_m else 0 end), 0) as full_m,
      coalesce(sum(case when rating = 'partial' then length_m else 0 end), 0) as partial_m,
      coalesce(sum(case when rating = 'none'    then length_m else 0 end), 0) as none_m,
      coalesce(sum(case when rating = 'unknown' then length_m else 0 end), 0) as unknown_m
    from path_edges
  )
  select json_build_object(
    'coordinates',     (select json_agg(coord) from coord_list),
    'distance_m',      t.distance_m,
    'rating_summary',  json_build_object(
                         'full_m',    t.full_m,
                         'partial_m', t.partial_m,
                         'none_m',    t.none_m,
                         'unknown_m', t.unknown_m
                       )
  )
  into v_result
  from totals t;

  -- No path found (Dijkstra returned no rows)
  if v_result is null or (v_result->>'coordinates') is null then
    return '{"error":"no_route_found"}'::json;
  end if;

  return v_result;
end;
$$;

grant execute on function route_accessible(double precision, double precision, double precision, double precision)
  to anon, authenticated;
