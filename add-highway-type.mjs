import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

// 1. Add the column
await c.query(`
  ALTER TABLE street_segments
  ADD COLUMN IF NOT EXISTS highway_type text
`);
console.log('✓ highway_type column added');

// 2. Back-fill existing rows from field_sources (best effort — sets NULL where no tag was stored)
// field_sources contains the raw OSM tag keys; highway_type needs the VALUE, which we don't have.
// So existing rows stay NULL — they'll get proper values on the next full reimport.
console.log('  (existing rows will be NULL until next reimport)');

// 3. Update segment_rating() to factor in highway type
// High-traffic roads (primary/secondary/tertiary) with no sidewalk/wheelchair info → none
// Residential/service/unclassified with no info → partial (walkable but imperfect)
// Dedicated pedestrian ways with no info → unknown (as before)
await c.query(`
CREATE OR REPLACE FUNCTION public.segment_rating(
  surface_type text,
  smoothness text,
  sidewalk_width_m numeric,
  incline_percent numeric,
  is_step_free boolean,
  lit boolean,
  has_curb_cuts boolean,
  has_tactile_paving boolean,
  is_obstacle_free boolean,
  highway_type text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  score int := 0;
  penalized int := 0;
  has_data boolean := false;
BEGIN
  -- Immediate disqualifiers
  IF is_step_free = false                                THEN RETURN 'none'; END IF;
  IF is_obstacle_free = false                            THEN RETURN 'none'; END IF;
  IF smoothness IN ('horrible','very_horrible','impassable') THEN RETURN 'none'; END IF;
  IF surface_type IN ('mud','sand','grass')               THEN RETURN 'none'; END IF;
  IF incline_percent IS NOT NULL AND abs(incline_percent) > 20 THEN RETURN 'none'; END IF;

  -- High-traffic roads with no pedestrian-specific data → none (don't route along busy roads)
  IF highway_type IN ('primary','secondary','trunk','motorway') THEN
    -- Only keep them if there is explicit positive accessibility evidence
    IF is_step_free IS NULL AND sidewalk_width_m IS NULL AND surface_type IS NULL THEN
      RETURN 'none';
    END IF;
  END IF;

  -- Score positive signals
  IF surface_type IN ('asphalt','concrete','paved','paving_stones') THEN score := score + 2; has_data := true; END IF;
  IF surface_type IN ('compacted','fine_gravel')                     THEN score := score + 1; has_data := true; END IF;
  IF surface_type IN ('sett','cobblestone','gravel','dirt','ground') THEN penalized := penalized + 1; has_data := true; END IF;

  IF smoothness = 'excellent'                         THEN score := score + 2; has_data := true; END IF;
  IF smoothness IN ('good','intermediate')            THEN score := score + 1; has_data := true; END IF;
  IF smoothness IN ('bad','very_bad')                 THEN penalized := penalized + 1; has_data := true; END IF;

  IF sidewalk_width_m >= 1.8                          THEN score := score + 2; has_data := true; END IF;
  IF sidewalk_width_m >= 1.2 AND sidewalk_width_m < 1.8 THEN score := score + 1; has_data := true; END IF;
  IF sidewalk_width_m IS NOT NULL AND sidewalk_width_m < 1.2 THEN penalized := penalized + 1; has_data := true; END IF;

  IF incline_percent IS NOT NULL AND abs(incline_percent) <= 5  THEN score := score + 1; has_data := true; END IF;
  IF incline_percent IS NOT NULL AND abs(incline_percent) > 10  THEN penalized := penalized + 1; END IF;

  IF is_step_free = true   THEN score := score + 1; has_data := true; END IF;
  IF lit = true            THEN score := score + 1; has_data := true; END IF;
  IF has_curb_cuts = true  THEN score := score + 1; has_data := true; END IF;

  -- Road-type baseline: residential/service/tertiary with no data → partial (not none)
  IF NOT has_data THEN
    IF highway_type IN ('residential','living_street','service','unclassified','tertiary') THEN
      RETURN 'partial';
    END IF;
    RETURN 'unknown';
  END IF;

  -- Penalised enough → none/partial
  IF penalized >= 2 THEN RETURN 'none'; END IF;

  IF score >= 5 AND penalized = 0 THEN RETURN 'full'; END IF;
  IF score >= 2                   THEN RETURN 'partial'; END IF;
  IF penalized >= 1               THEN RETURN 'partial'; END IF;
  RETURN 'unknown';
END;
$$;
`);
console.log('✓ segment_rating() updated to use highway_type');

// 4. Update segment_cost() to add a road-type surcharge so the router prefers sidewalks
await c.query(`
CREATE OR REPLACE FUNCTION public.segment_cost(
  surface_type text,
  smoothness text,
  sidewalk_width_m numeric,
  incline_percent numeric,
  is_step_free boolean,
  lit boolean,
  has_curb_cuts boolean,
  has_tactile_paving boolean,
  is_obstacle_free boolean,
  length_m float8,
  highway_type text DEFAULT NULL
) RETURNS float8 LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  rating text;
  base   float8;
  road_mult float8 := 1.0;
BEGIN
  rating := segment_rating(surface_type, smoothness, sidewalk_width_m, incline_percent,
                           is_step_free, lit, has_curb_cuts, has_tactile_paving,
                           is_obstacle_free, highway_type);

  base := CASE rating
    WHEN 'full'    THEN length_m * 1.0
    WHEN 'partial' THEN length_m * 2.5
    WHEN 'unknown' THEN length_m * 2.0
    ELSE                length_m * 100.0   -- 'none' = strong but soft barrier
  END;

  -- Extra multiplier for roads (prefers dedicated footways when equal distance)
  road_mult := CASE highway_type
    WHEN 'primary'      THEN 3.0
    WHEN 'secondary'    THEN 2.5
    WHEN 'tertiary'     THEN 1.8
    WHEN 'residential'  THEN 1.3
    WHEN 'service'      THEN 1.2
    WHEN 'unclassified' THEN 1.2
    WHEN 'track'        THEN 1.5
    ELSE 1.0  -- footway, path, pedestrian, etc.
  END;

  RETURN base * road_mult;
END;
$$;
`);
console.log('✓ segment_cost() updated with highway_type road multiplier');

// Verify
const r = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='street_segments' AND column_name='highway_type'`);
console.log('\nColumn in DB:', r.rows[0]);

await c.end();
