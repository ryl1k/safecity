import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// Adds max_incline parameter to route_accessible_v.
// When set, segments where abs(incline_percent) > max_incline get a 10× cost
// penalty. Segments with NULL incline_percent are not penalised (unknown = OK).
const sql = `
CREATE OR REPLACE FUNCTION public.route_accessible_v(
  start_lng   double precision,
  start_lat   double precision,
  end_lng     double precision,
  end_lat     double precision,
  mode        text    DEFAULT 'moderate',
  max_incline float8  DEFAULT NULL
) RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER AS $func$
DECLARE
  v_se bigint; v_src_s bigint; v_tgt_s bigint;
  v_sf float8; v_cost_s float8; v_rat_s text; v_len_s float8; v_geom_s geometry;

  v_ee bigint; v_src_e bigint; v_tgt_e bigint;
  v_ef float8; v_cost_e float8; v_rat_e text; v_len_e float8; v_geom_e geometry;

  v_edges_sql   text;
  v_cost_expr   text;
  v_rat_filter  text;
  v_incline_sql text;
  v_result      json;
  v_sub_geom    geometry;
BEGIN

  -- ── Choose cost expression and none-filter based on mode ─────────────────
  IF mode = 'flat' THEN
    v_cost_expr  := 'ST_Length(geom::geography)';
    v_rat_filter := '';
  ELSIF mode = 'moderate' THEN
    v_cost_expr  :=
      'CASE segment_rating(surface_type,smoothness,sidewalk_width_m,incline_percent,'
      '     is_step_free,lit,has_curb_cuts,has_tactile_paving,is_obstacle_free)'
      '  WHEN ''full''    THEN ST_Length(geom::geography)'
      '  WHEN ''partial'' THEN ST_Length(geom::geography) * 2.0'
      '  WHEN ''unknown'' THEN ST_Length(geom::geography) * 1.5'
      '  ELSE                  ST_Length(geom::geography) * 5.0'
      ' END';
    v_rat_filter := '';
  ELSE  -- strict
    v_cost_expr  :=
      'segment_cost(surface_type,smoothness,sidewalk_width_m,incline_percent,'
      '             is_step_free,lit,has_curb_cuts,has_tactile_paving,'
      '             is_obstacle_free,ST_Length(geom::geography))';
    v_rat_filter :=
      'AND segment_rating(surface_type,smoothness,sidewalk_width_m,incline_percent,'
      '    is_step_free,lit,has_curb_cuts,has_tactile_paving,is_obstacle_free) <> ''none''';
  END IF;

  -- ── Incline penalty (only when max_incline is supplied) ──────────────────
  IF max_incline IS NOT NULL THEN
    v_incline_sql := format(
      '* CASE WHEN incline_percent IS NOT NULL AND abs(incline_percent) > %s THEN 10.0 ELSE 1.0 END',
      max_incline
    );
  ELSE
    v_incline_sql := '';
  END IF;

  -- Wrap base cost expression with incline multiplier.
  v_cost_expr := '(' || v_cost_expr || ') ' || v_incline_sql;

  -- ── SNAP START ───────────────────────────────────────────────────────────
  SELECT c.seg_id, c.source, c.target,
    ST_LineLocatePoint(c.geom, ST_ClosestPoint(c.geom, ST_SetSRID(ST_MakePoint(start_lng, start_lat), 4326))),
    segment_cost(c.surface_type, c.smoothness, c.sidewalk_width_m, c.incline_percent,
                 c.is_step_free, c.lit, c.has_curb_cuts, c.has_tactile_paving,
                 c.is_obstacle_free, ST_Length(c.geom::geography)),
    segment_rating(c.surface_type, c.smoothness, c.sidewalk_width_m, c.incline_percent,
                   c.is_step_free, c.lit, c.has_curb_cuts, c.has_tactile_paving, c.is_obstacle_free),
    ST_Length(c.geom::geography), c.geom
  INTO v_se, v_src_s, v_tgt_s, v_sf, v_cost_s, v_rat_s, v_len_s, v_geom_s
  FROM (
    SELECT seg_id, source, target, geom,
           surface_type, smoothness, sidewalk_width_m, incline_percent,
           is_step_free, lit, has_curb_cuts, has_tactile_paving, is_obstacle_free,
           ST_Distance(ST_ClosestPoint(geom, ST_SetSRID(ST_MakePoint(start_lng, start_lat), 4326))::geography,
                       ST_SetSRID(ST_MakePoint(start_lng, start_lat), 4326)::geography) AS proj_dist
    FROM street_segments
    WHERE source IS NOT NULL AND target IS NOT NULL
      AND source IN (SELECT node FROM main_component_nodes)
      AND target IN (SELECT node FROM main_component_nodes)
      AND segment_rating(surface_type, smoothness, sidewalk_width_m, incline_percent,
                         is_step_free, lit, has_curb_cuts, has_tactile_paving, is_obstacle_free) <> 'none'
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(start_lng, start_lat), 4326) LIMIT 20
  ) c ORDER BY c.proj_dist LIMIT 1;

  -- ── SNAP END ─────────────────────────────────────────────────────────────
  SELECT c.seg_id, c.source, c.target,
    ST_LineLocatePoint(c.geom, ST_ClosestPoint(c.geom, ST_SetSRID(ST_MakePoint(end_lng, end_lat), 4326))),
    segment_cost(c.surface_type, c.smoothness, c.sidewalk_width_m, c.incline_percent,
                 c.is_step_free, c.lit, c.has_curb_cuts, c.has_tactile_paving,
                 c.is_obstacle_free, ST_Length(c.geom::geography)),
    segment_rating(c.surface_type, c.smoothness, c.sidewalk_width_m, c.incline_percent,
                   c.is_step_free, c.lit, c.has_curb_cuts, c.has_tactile_paving, c.is_obstacle_free),
    ST_Length(c.geom::geography), c.geom
  INTO v_ee, v_src_e, v_tgt_e, v_ef, v_cost_e, v_rat_e, v_len_e, v_geom_e
  FROM (
    SELECT seg_id, source, target, geom,
           surface_type, smoothness, sidewalk_width_m, incline_percent,
           is_step_free, lit, has_curb_cuts, has_tactile_paving, is_obstacle_free,
           ST_Distance(ST_ClosestPoint(geom, ST_SetSRID(ST_MakePoint(end_lng, end_lat), 4326))::geography,
                       ST_SetSRID(ST_MakePoint(end_lng, end_lat), 4326)::geography) AS proj_dist
    FROM street_segments
    WHERE source IS NOT NULL AND target IS NOT NULL
      AND source IN (SELECT node FROM main_component_nodes)
      AND target IN (SELECT node FROM main_component_nodes)
      AND segment_rating(surface_type, smoothness, sidewalk_width_m, incline_percent,
                         is_step_free, lit, has_curb_cuts, has_tactile_paving, is_obstacle_free) <> 'none'
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(end_lng, end_lat), 4326) LIMIT 20
  ) c ORDER BY c.proj_dist LIMIT 1;

  IF v_se IS NULL OR v_ee IS NULL THEN
    RETURN '{"error":"no_graph_near_points"}'::json;
  END IF;

  -- ── Override virtual edge costs for non-strict modes ────────────────────
  IF mode = 'flat' THEN
    v_cost_s := v_len_s;
    v_cost_e := v_len_e;
  ELSIF mode = 'moderate' THEN
    v_cost_s := v_len_s * CASE v_rat_s WHEN 'full' THEN 1.0 WHEN 'partial' THEN 2.0 WHEN 'unknown' THEN 1.5 ELSE 5.0 END;
    v_cost_e := v_len_e * CASE v_rat_e WHEN 'full' THEN 1.0 WHEN 'partial' THEN 2.0 WHEN 'unknown' THEN 1.5 ELSE 5.0 END;
  END IF;

  -- ── SAME-EDGE SHORTCUT ───────────────────────────────────────────────────
  IF v_se = v_ee THEN
    v_sub_geom := CASE WHEN v_sf <= v_ef
      THEN ST_LineSubstring(v_geom_s, v_sf, v_ef)
      ELSE ST_Reverse(ST_LineSubstring(v_geom_s, v_ef, v_sf))
    END;
    RETURN json_build_object(
      'coordinates', (SELECT json_agg(jsonb_build_array(round(ST_X(dp.geom)::numeric,7), round(ST_Y(dp.geom)::numeric,7)))
                      FROM ST_DumpPoints(v_sub_geom) dp),
      'distance_m', ST_Length(v_sub_geom::geography),
      'rating_summary', json_build_object(
        'full_m',    CASE WHEN v_rat_s='full'    THEN ST_Length(v_sub_geom::geography) ELSE 0.0 END,
        'partial_m', CASE WHEN v_rat_s='partial' THEN ST_Length(v_sub_geom::geography) ELSE 0.0 END,
        'none_m',    0.0::float8,
        'unknown_m', CASE WHEN v_rat_s='unknown' THEN ST_Length(v_sub_geom::geography) ELSE 0.0 END
      )
    );
  END IF;

  -- ── BUILD EDGES SQL ──────────────────────────────────────────────────────
  v_edges_sql := format($esql$
    SELECT seg_id::bigint AS id, source, target,
      %s AS cost, %s AS reverse_cost
    FROM street_segments
    WHERE source IS NOT NULL AND target IS NOT NULL
      AND seg_id NOT IN (%s, %s)
      AND source IN (SELECT node FROM main_component_nodes)
      AND target IN (SELECT node FROM main_component_nodes)
      %s
    UNION ALL SELECT -1::bigint, -1::bigint, %s::bigint, %s::float8, %s::float8
    UNION ALL SELECT -2::bigint, -1::bigint, %s::bigint, %s::float8, %s::float8
    UNION ALL SELECT -3::bigint, %s::bigint, -2::bigint, %s::float8, %s::float8
    UNION ALL SELECT -4::bigint, %s::bigint, -2::bigint, %s::float8, %s::float8
  $esql$,
    v_cost_expr, v_cost_expr,
    v_se, v_ee,
    v_rat_filter,
    v_src_s, v_sf          * v_cost_s, v_sf          * v_cost_s,
    v_tgt_s, (1.0 - v_sf) * v_cost_s, (1.0 - v_sf) * v_cost_s,
    v_src_e, v_ef          * v_cost_e, v_ef          * v_cost_e,
    v_tgt_e, (1.0 - v_ef) * v_cost_e, (1.0 - v_ef) * v_cost_e
  );

  -- ── ROUTE + RECONSTRUCT ──────────────────────────────────────────────────
  WITH
  path_rows AS (
    SELECT seq, node, edge FROM pgr_dijkstra(v_edges_sql, -1, -2, directed := false)
    WHERE edge <> -1
  ),
  geom_rows AS (
    SELECT pr.seq,
      CASE
        WHEN pr.edge = -1 THEN ST_Reverse(ST_LineSubstring(v_geom_s, 0.0, GREATEST(v_sf, 0.0001)))
        WHEN pr.edge = -2 THEN ST_LineSubstring(v_geom_s, LEAST(v_sf, 0.9999), 1.0)
        WHEN pr.edge = -3 THEN ST_LineSubstring(v_geom_e, 0.0, GREATEST(v_ef, 0.0001))
        WHEN pr.edge = -4 THEN ST_Reverse(ST_LineSubstring(v_geom_e, LEAST(v_ef, 0.9999), 1.0))
        WHEN pr.node = ss.source THEN ss.geom
        ELSE ST_Reverse(ss.geom)
      END AS geom,
      CASE
        WHEN pr.edge IN (-1,-2) THEN v_rat_s
        WHEN pr.edge IN (-3,-4) THEN v_rat_e
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
    SELECT jsonb_build_array(round(ST_X(dp.geom)::numeric,7), round(ST_Y(dp.geom)::numeric,7)) AS coord,
           gr.seq * 10000 + dp.path[1] AS ord
    FROM geom_rows gr, LATERAL ST_DumpPoints(gr.geom) dp
    ORDER BY ord
  ),
  totals AS (
    SELECT coalesce(sum(length_m),0) AS distance_m,
           coalesce(sum(CASE WHEN rating='full'    THEN length_m ELSE 0 END),0) AS full_m,
           coalesce(sum(CASE WHEN rating='partial' THEN length_m ELSE 0 END),0) AS partial_m,
           coalesce(sum(CASE WHEN rating='none'    THEN length_m ELSE 0 END),0) AS none_m,
           coalesce(sum(CASE WHEN rating='unknown' THEN length_m ELSE 0 END),0) AS unknown_m
    FROM geom_rows
  )
  SELECT json_build_object(
    'coordinates',    (SELECT json_agg(coord ORDER BY ord) FROM coord_list),
    'distance_m',     t.distance_m,
    'rating_summary', json_build_object('full_m',t.full_m,'partial_m',t.partial_m,'none_m',t.none_m,'unknown_m',t.unknown_m)
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

await client.query(sql);
console.log('✓ route_accessible_v() updated with max_incline parameter');
await client.end();
