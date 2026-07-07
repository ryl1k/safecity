import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// Remove the prepended actual-start and appended actual-end from the coordinates.
// The solid route line should be ONLY the edge geometry.
// The caller (frontend) shows the gap as a dotted connector.
const sql = `
CREATE OR REPLACE FUNCTION public.route_accessible(
  start_lng double precision, start_lat double precision,
  end_lng   double precision, end_lat   double precision
) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER AS $func$
DECLARE
  v_se bigint;
  v_sf double precision;
  v_ee bigint;
  v_ef double precision;
  v_result json;
BEGIN
  SELECT seg_id,
         ST_LineLocatePoint(geom, ST_SetSRID(ST_MakePoint(start_lng, start_lat), 4326))
  INTO v_se, v_sf
  FROM street_segments
  WHERE source IS NOT NULL AND target IS NOT NULL
    AND source IN (SELECT node FROM main_component_nodes)
    AND target IN (SELECT node FROM main_component_nodes)
    AND segment_rating(surface_type, smoothness, sidewalk_width_m, incline_percent,
                       is_step_free, lit, has_curb_cuts, has_tactile_paving,
                       is_obstacle_free) <> 'none'
  ORDER BY geom <-> ST_SetSRID(ST_MakePoint(start_lng, start_lat), 4326)
  LIMIT 1;

  SELECT seg_id,
         ST_LineLocatePoint(geom, ST_SetSRID(ST_MakePoint(end_lng, end_lat), 4326))
  INTO v_ee, v_ef
  FROM street_segments
  WHERE source IS NOT NULL AND target IS NOT NULL
    AND source IN (SELECT node FROM main_component_nodes)
    AND target IN (SELECT node FROM main_component_nodes)
    AND segment_rating(surface_type, smoothness, sidewalk_width_m, incline_percent,
                       is_step_free, lit, has_curb_cuts, has_tactile_paving,
                       is_obstacle_free) <> 'none'
  ORDER BY geom <-> ST_SetSRID(ST_MakePoint(end_lng, end_lat), 4326)
  LIMIT 1;

  IF v_se IS NULL OR v_ee IS NULL THEN
    RETURN '{"error":"no_graph_near_points"}'::json;
  END IF;

  WITH
  path_rows AS (
    SELECT seq, node, edge
    FROM pgr_withPoints(
      $edges_sql$
        SELECT seg_id::bigint AS id, source, target,
               segment_cost(surface_type, smoothness, sidewalk_width_m, incline_percent,
                            is_step_free, lit, has_curb_cuts, has_tactile_paving,
                            is_obstacle_free, st_length(geom::geography)) AS cost,
               segment_cost(surface_type, smoothness, sidewalk_width_m, incline_percent,
                            is_step_free, lit, has_curb_cuts, has_tactile_paving,
                            is_obstacle_free, st_length(geom::geography)) AS reverse_cost
        FROM street_segments
        WHERE source IS NOT NULL AND target IS NOT NULL
          AND source IN (SELECT node FROM main_component_nodes)
          AND target IN (SELECT node FROM main_component_nodes)
          AND segment_rating(surface_type, smoothness, sidewalk_width_m, incline_percent,
                             is_step_free, lit, has_curb_cuts, has_tactile_paving,
                             is_obstacle_free) <> 'none'
      $edges_sql$,
      format(
        'SELECT 1::integer AS pid, %s::bigint AS edge_id, %s::float8 AS fraction
         UNION ALL
         SELECT 2::integer, %s::bigint, %s::float8',
        v_se, v_sf, v_ee, v_ef
      ),
      -1, -2,
      false
    )
    WHERE edge > 0
  ),
  path_edges AS (
    SELECT pr.seq, pr.node, ss.source, ss.geom,
           segment_rating(ss.surface_type, ss.smoothness, ss.sidewalk_width_m,
                          ss.incline_percent, ss.is_step_free, ss.lit,
                          ss.has_curb_cuts, ss.has_tactile_paving,
                          ss.is_obstacle_free) AS rating,
           st_length(ss.geom::geography) AS length_m
    FROM path_rows pr
    JOIN street_segments ss ON ss.seg_id = pr.edge
    ORDER BY pr.seq
  ),
  oriented_edges AS (
    SELECT seq, length_m, rating,
           CASE
             WHEN node >= 0 AND node = source THEN geom
             WHEN node >= 0 AND node <> source THEN ST_Reverse(geom)
             ELSE geom
           END AS geom
    FROM path_edges
  ),
  -- Edge geometry only — no prepended start or appended end.
  -- The frontend draws dotted bezier connectors for the gap.
  coord_list AS (
    SELECT jsonb_build_array(
             round(st_x(dp.geom)::numeric, 7),
             round(st_y(dp.geom)::numeric, 7)
           ) AS coord,
           oe.seq * 10000 + dp.path[1] AS ord
    FROM oriented_edges oe,
         lateral st_dumppoints(oe.geom) AS dp
    ORDER BY ord
  ),
  totals AS (
    SELECT coalesce(sum(length_m), 0) AS distance_m,
           coalesce(sum(CASE WHEN rating = 'full'    THEN length_m ELSE 0 END), 0) AS full_m,
           coalesce(sum(CASE WHEN rating = 'partial' THEN length_m ELSE 0 END), 0) AS partial_m,
           coalesce(sum(CASE WHEN rating = 'none'    THEN length_m ELSE 0 END), 0) AS none_m,
           coalesce(sum(CASE WHEN rating = 'unknown' THEN length_m ELSE 0 END), 0) AS unknown_m
    FROM oriented_edges
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
  console.log('✓ route_accessible() updated — no prepend/append');

  const r = await client.query(`SELECT route_accessible(24.029, 49.841, 24.035, 49.845) AS r`);
  const res = r.rows[0]?.r;
  if (res?.error) {
    console.log('Route error:', res.error);
  } else {
    const coords = res?.coordinates ?? [];
    console.log(`Route: ${coords.length} coords, ${Math.round(res?.distance_m)}m`);
    console.log('  first:', coords[0], '← should be on-edge, not clicked point');
    console.log('  last: ', coords[coords.length - 1]);
  }
} catch (err) {
  console.error('✗', err.message);
}

await client.end();
