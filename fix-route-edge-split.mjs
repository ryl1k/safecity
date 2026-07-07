import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// Replace pgr_withPoints with our own edge-split approach:
//
//  1. SNAP: find closest point on ANY accessible edge (not just nearest vertex).
//     KNN (<->) gives 20 candidate edges from the spatial index, then we pick
//     the one whose ST_ClosestPoint projection is geometrically nearest.
//
//  2. SPLIT: remove the snapped edge from the graph; inject 4 virtual half-edges:
//       edge -1: virtual_start(-1)  → source_s   cost = f_s * full_cost_s
//       edge -2: virtual_start(-1)  → target_s   cost = (1-f_s) * full_cost_s
//       edge -3: source_e           → virtual_end(-2)   cost = f_e * full_cost_e
//       edge -4: target_e           → virtual_end(-2)   cost = (1-f_e) * full_cost_e
//     pgr_dijkstra (undirected) routes from -1 to -2 and picks which vertex
//     to exit/enter through automatically.
//
//  3. GEOMETRY: ST_LineSubstring reconstructs partial edge geometry for each
//     virtual half-edge; full edge geometry (oriented by node direction) for
//     the real edges.
//
//  SPECIAL CASE: if both points snap to the same edge, return ST_LineSubstring
//  directly without running Dijkstra.

const sql = `
CREATE OR REPLACE FUNCTION public.route_accessible(
  start_lng double precision, start_lat double precision,
  end_lng   double precision, end_lat   double precision
) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER AS $func$
DECLARE
  -- Start snap
  v_se     bigint;          -- start edge seg_id
  v_src_s  bigint;          -- start edge: source vertex
  v_tgt_s  bigint;          -- start edge: target vertex
  v_sf     float8;          -- fraction along start edge (0=source, 1=target)
  v_cost_s float8;          -- full cost of start edge
  v_rat_s  text;            -- rating of start edge
  v_len_s  float8;          -- length (m) of start edge
  v_geom_s geometry;        -- geometry of start edge

  -- End snap
  v_ee     bigint;
  v_src_e  bigint;
  v_tgt_e  bigint;
  v_ef     float8;
  v_cost_e float8;
  v_rat_e  text;
  v_len_e  float8;
  v_geom_e geometry;

  v_edges_sql text;
  v_result    json;
  v_sub_geom  geometry;     -- for same-edge shortcut
BEGIN

  -- ── SNAP START ──────────────────────────────────────────────────────────
  -- KNN gives ≤20 candidate edges cheaply; ST_Distance selects the true best.
  SELECT
    c.seg_id, c.source, c.target,
    ST_LineLocatePoint(c.geom, ST_ClosestPoint(c.geom, ST_SetSRID(ST_MakePoint(start_lng, start_lat), 4326))),
    segment_cost(c.surface_type, c.smoothness, c.sidewalk_width_m, c.incline_percent,
                 c.is_step_free, c.lit, c.has_curb_cuts, c.has_tactile_paving,
                 c.is_obstacle_free, ST_Length(c.geom::geography)),
    segment_rating(c.surface_type, c.smoothness, c.sidewalk_width_m, c.incline_percent,
                   c.is_step_free, c.lit, c.has_curb_cuts, c.has_tactile_paving, c.is_obstacle_free),
    ST_Length(c.geom::geography),
    c.geom
  INTO v_se, v_src_s, v_tgt_s, v_sf, v_cost_s, v_rat_s, v_len_s, v_geom_s
  FROM (
    SELECT seg_id, source, target, geom,
           surface_type, smoothness, sidewalk_width_m, incline_percent,
           is_step_free, lit, has_curb_cuts, has_tactile_paving, is_obstacle_free,
           ST_Distance(
             ST_ClosestPoint(geom, ST_SetSRID(ST_MakePoint(start_lng, start_lat), 4326))::geography,
             ST_SetSRID(ST_MakePoint(start_lng, start_lat), 4326)::geography
           ) AS proj_dist
    FROM street_segments
    WHERE source IS NOT NULL AND target IS NOT NULL
      AND source IN (SELECT node FROM main_component_nodes)
      AND target IN (SELECT node FROM main_component_nodes)
      AND segment_rating(surface_type, smoothness, sidewalk_width_m, incline_percent,
                         is_step_free, lit, has_curb_cuts, has_tactile_paving,
                         is_obstacle_free) <> 'none'
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(start_lng, start_lat), 4326)
    LIMIT 20
  ) c
  ORDER BY c.proj_dist
  LIMIT 1;

  -- ── SNAP END ────────────────────────────────────────────────────────────
  SELECT
    c.seg_id, c.source, c.target,
    ST_LineLocatePoint(c.geom, ST_ClosestPoint(c.geom, ST_SetSRID(ST_MakePoint(end_lng, end_lat), 4326))),
    segment_cost(c.surface_type, c.smoothness, c.sidewalk_width_m, c.incline_percent,
                 c.is_step_free, c.lit, c.has_curb_cuts, c.has_tactile_paving,
                 c.is_obstacle_free, ST_Length(c.geom::geography)),
    segment_rating(c.surface_type, c.smoothness, c.sidewalk_width_m, c.incline_percent,
                   c.is_step_free, c.lit, c.has_curb_cuts, c.has_tactile_paving, c.is_obstacle_free),
    ST_Length(c.geom::geography),
    c.geom
  INTO v_ee, v_src_e, v_tgt_e, v_ef, v_cost_e, v_rat_e, v_len_e, v_geom_e
  FROM (
    SELECT seg_id, source, target, geom,
           surface_type, smoothness, sidewalk_width_m, incline_percent,
           is_step_free, lit, has_curb_cuts, has_tactile_paving, is_obstacle_free,
           ST_Distance(
             ST_ClosestPoint(geom, ST_SetSRID(ST_MakePoint(end_lng, end_lat), 4326))::geography,
             ST_SetSRID(ST_MakePoint(end_lng, end_lat), 4326)::geography
           ) AS proj_dist
    FROM street_segments
    WHERE source IS NOT NULL AND target IS NOT NULL
      AND source IN (SELECT node FROM main_component_nodes)
      AND target IN (SELECT node FROM main_component_nodes)
      AND segment_rating(surface_type, smoothness, sidewalk_width_m, incline_percent,
                         is_step_free, lit, has_curb_cuts, has_tactile_paving,
                         is_obstacle_free) <> 'none'
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(end_lng, end_lat), 4326)
    LIMIT 20
  ) c
  ORDER BY c.proj_dist
  LIMIT 1;

  IF v_se IS NULL OR v_ee IS NULL THEN
    RETURN '{"error":"no_graph_near_points"}'::json;
  END IF;

  -- ── SAME-EDGE SHORTCUT ──────────────────────────────────────────────────
  -- Both points project onto the same edge → just return the sub-segment.
  IF v_se = v_ee THEN
    v_sub_geom := CASE
      WHEN v_sf <= v_ef THEN ST_LineSubstring(v_geom_s, v_sf, v_ef)
      ELSE ST_Reverse(ST_LineSubstring(v_geom_s, v_ef, v_sf))
    END;
    SELECT json_build_object(
      'coordinates', (
        SELECT json_agg(jsonb_build_array(
                 round(ST_X(dp.geom)::numeric, 7),
                 round(ST_Y(dp.geom)::numeric, 7)
               ))
        FROM ST_DumpPoints(v_sub_geom) dp
      ),
      'distance_m', ST_Length(v_sub_geom::geography),
      'rating_summary', json_build_object(
        'full_m',    CASE WHEN v_rat_s = 'full'    THEN ST_Length(v_sub_geom::geography) ELSE 0.0 END,
        'partial_m', CASE WHEN v_rat_s = 'partial' THEN ST_Length(v_sub_geom::geography) ELSE 0.0 END,
        'none_m',    0.0::float8,
        'unknown_m', CASE WHEN v_rat_s = 'unknown' THEN ST_Length(v_sub_geom::geography) ELSE 0.0 END
      )
    ) INTO v_result;
    RETURN v_result;
  END IF;

  -- ── BUILD EDGES SQL ──────────────────────────────────────────────────────
  -- Virtual edge IDs: -1, -2 (start half-edges), -3, -4 (end half-edges).
  -- We exclude the snapped edges from the regular graph so costs aren't double-counted.
  v_edges_sql := format($esql$
    SELECT seg_id::bigint AS id, source, target,
      segment_cost(surface_type, smoothness, sidewalk_width_m, incline_percent,
                   is_step_free, lit, has_curb_cuts, has_tactile_paving,
                   is_obstacle_free, ST_Length(geom::geography)) AS cost,
      segment_cost(surface_type, smoothness, sidewalk_width_m, incline_percent,
                   is_step_free, lit, has_curb_cuts, has_tactile_paving,
                   is_obstacle_free, ST_Length(geom::geography)) AS reverse_cost
    FROM street_segments
    WHERE source IS NOT NULL AND target IS NOT NULL
      AND seg_id NOT IN (%s, %s)
      AND source IN (SELECT node FROM main_component_nodes)
      AND target IN (SELECT node FROM main_component_nodes)
      AND segment_rating(surface_type, smoothness, sidewalk_width_m, incline_percent,
                         is_step_free, lit, has_curb_cuts, has_tactile_paving,
                         is_obstacle_free) <> 'none'
    -- edge -1: virtual_start(-1) → source_s,  cost = f_s * cost_s
    UNION ALL SELECT -1::bigint, -1::bigint, %s::bigint, %s::float8, %s::float8
    -- edge -2: virtual_start(-1) → target_s,  cost = (1-f_s) * cost_s
    UNION ALL SELECT -2::bigint, -1::bigint, %s::bigint, %s::float8, %s::float8
    -- edge -3: source_e → virtual_end(-2),    cost = f_e * cost_e
    UNION ALL SELECT -3::bigint, %s::bigint, -2::bigint, %s::float8, %s::float8
    -- edge -4: target_e → virtual_end(-2),    cost = (1-f_e) * cost_e
    UNION ALL SELECT -4::bigint, %s::bigint, -2::bigint, %s::float8, %s::float8
  $esql$,
    -- NOT IN (start_edge, end_edge)
    v_se, v_ee,
    -- edge -1
    v_src_s,  v_sf          * v_cost_s,  v_sf          * v_cost_s,
    -- edge -2
    v_tgt_s,  (1.0 - v_sf) * v_cost_s,  (1.0 - v_sf) * v_cost_s,
    -- edge -3
    v_src_e,  v_ef          * v_cost_e,  v_ef          * v_cost_e,
    -- edge -4
    v_tgt_e,  (1.0 - v_ef) * v_cost_e,  (1.0 - v_ef) * v_cost_e
  );

  -- ── ROUTE + RECONSTRUCT GEOMETRY ─────────────────────────────────────────
  WITH
  path_rows AS (
    SELECT seq, node, edge
    FROM pgr_dijkstra(v_edges_sql, -1, -2, directed := false)
    WHERE edge <> -1   -- pgr_dijkstra uses -1 as "no next edge" on the final row
  ),
  geom_rows AS (
    SELECT
      pr.seq,
      CASE
        -- Half of start edge: snap_s → source_s (going backward along the edge)
        WHEN pr.edge = -1 THEN ST_Reverse(ST_LineSubstring(v_geom_s, 0.0, GREATEST(v_sf, 0.0001)))
        -- Half of start edge: snap_s → target_s (going forward along the edge)
        WHEN pr.edge = -2 THEN ST_LineSubstring(v_geom_s, LEAST(v_sf, 0.9999), 1.0)
        -- Half of end edge: source_e → snap_e
        WHEN pr.edge = -3 THEN ST_LineSubstring(v_geom_e, 0.0, GREATEST(v_ef, 0.0001))
        -- Half of end edge: target_e → snap_e (going backward)
        WHEN pr.edge = -4 THEN ST_Reverse(ST_LineSubstring(v_geom_e, LEAST(v_ef, 0.9999), 1.0))
        -- Real edge: orient by traversal direction
        WHEN pr.node = ss.source THEN ss.geom
        ELSE ST_Reverse(ss.geom)
      END AS geom,
      CASE
        WHEN pr.edge IN (-1, -2) THEN v_rat_s
        WHEN pr.edge IN (-3, -4) THEN v_rat_e
        ELSE segment_rating(ss.surface_type, ss.smoothness, ss.sidewalk_width_m,
                            ss.incline_percent, ss.is_step_free, ss.lit,
                            ss.has_curb_cuts, ss.has_tactile_paving, ss.is_obstacle_free)
      END AS rating,
      CASE
        WHEN pr.edge = -1 THEN v_sf          * v_len_s
        WHEN pr.edge = -2 THEN (1.0 - v_sf) * v_len_s
        WHEN pr.edge = -3 THEN v_ef          * v_len_e
        WHEN pr.edge = -4 THEN (1.0 - v_ef) * v_len_e
        ELSE ST_Length(ss.geom::geography)
      END AS length_m
    FROM path_rows pr
    LEFT JOIN street_segments ss ON ss.seg_id = pr.edge AND pr.edge > 0
  ),
  coord_list AS (
    SELECT
      jsonb_build_array(
        round(ST_X(dp.geom)::numeric, 7),
        round(ST_Y(dp.geom)::numeric, 7)
      ) AS coord,
      gr.seq * 10000 + dp.path[1] AS ord
    FROM geom_rows gr,
         LATERAL ST_DumpPoints(gr.geom) dp
    ORDER BY ord
  ),
  totals AS (
    SELECT
      coalesce(sum(length_m), 0)                                         AS distance_m,
      coalesce(sum(CASE WHEN rating = 'full'    THEN length_m ELSE 0 END), 0) AS full_m,
      coalesce(sum(CASE WHEN rating = 'partial' THEN length_m ELSE 0 END), 0) AS partial_m,
      coalesce(sum(CASE WHEN rating = 'none'    THEN length_m ELSE 0 END), 0) AS none_m,
      coalesce(sum(CASE WHEN rating = 'unknown' THEN length_m ELSE 0 END), 0) AS unknown_m
    FROM geom_rows
  )
  SELECT json_build_object(
    'coordinates',    (SELECT json_agg(coord ORDER BY ord) FROM coord_list),
    'distance_m',     t.distance_m,
    'rating_summary', json_build_object(
      'full_m',    t.full_m,
      'partial_m', t.partial_m,
      'none_m',    t.none_m,
      'unknown_m', t.unknown_m
    )
  ) INTO v_result FROM totals t;

  IF v_result IS NULL OR (v_result->>'coordinates') IS NULL THEN
    RETURN '{"error":"no_route_found"}'::json;
  END IF;
  IF json_array_length(v_result->'coordinates') < 2 THEN
    RETURN '{"error":"no_route_found"}'::json;
  END IF;

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$func$;
`;

try {
  await client.query(sql);
  console.log('✓ route_accessible() updated — custom edge-split routing');

  // Smoke test: two points a few hundred metres apart
  console.log('\nSmoke test 1: normal route across the city...');
  const t1 = Date.now();
  const r1 = await client.query(`SELECT route_accessible(24.029, 49.841, 24.035, 49.845) AS r`);
  const ms1 = Date.now() - t1;
  const res1 = r1.rows[0]?.r;
  if (res1?.error) {
    console.log('  error:', res1.error);
  } else {
    const coords = res1?.coordinates ?? [];
    console.log(`  ${coords.length} coords, ${Math.round(res1?.distance_m)}m  (${ms1}ms)`);
    console.log('  first coord (= snap_start on edge):', coords[0]);
    console.log('  last  coord (= snap_end   on edge):', coords[coords.length - 1]);
  }

  // Smoke test 2: very short distance → same-edge shortcut
  console.log('\nSmoke test 2: nearby points → same-edge shortcut...');
  const t2 = Date.now();
  const r2 = await client.query(`SELECT route_accessible(24.0295, 49.8430, 24.0296, 49.8430) AS r`);
  const ms2 = Date.now() - t2;
  const res2 = r2.rows[0]?.r;
  if (res2?.error) {
    console.log('  error:', res2.error);
  } else {
    const coords2 = res2?.coordinates ?? [];
    console.log(`  ${coords2.length} coords, ${Math.round(res2?.distance_m)}m  (${ms2}ms)`);
  }

} catch (err) {
  console.error('✗', err.message);
}

await client.end();
