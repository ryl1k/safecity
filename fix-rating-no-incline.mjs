import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(`DROP FUNCTION IF EXISTS public.segment_rating(text,text,numeric,numeric,boolean,boolean,boolean,boolean,boolean)`);
await c.query(`
CREATE OR REPLACE FUNCTION public.segment_rating(
  p_surface     text,
  p_smoothness  text,
  p_width       numeric,
  p_incline     numeric,
  p_step_free   boolean,
  p_lit         boolean,
  p_has_curb_cuts     boolean,
  p_has_tactile       boolean,
  p_obstacle_free     boolean
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_step_free     = false THEN 'none'
    WHEN p_has_curb_cuts = false THEN 'none'
    WHEN p_width IS NOT NULL AND p_width < 0.9 THEN 'none'
    WHEN p_smoothness = ANY(ARRAY['bad','very_bad','horrible','very_horrible','impassable']) THEN 'none'
    WHEN p_surface = ANY(ARRAY['cobblestone','unhewn_cobblestone','pebblestone','gravel',
      'sand','ground','dirt','earth','grass','mud','unpaved','rock'])
     AND p_smoothness IS DISTINCT FROM 'excellent'
     AND p_smoothness IS DISTINCT FROM 'good' THEN 'none'
    WHEN p_has_curb_cuts = true AND p_step_free = true THEN
      CASE
        WHEN p_has_tactile   = false                                         THEN 'partial'
        WHEN p_obstacle_free = false                                         THEN 'partial'
        WHEN p_lit           = false                                         THEN 'partial'
        WHEN p_width IS NOT NULL AND p_width < 1.5                           THEN 'partial'
        WHEN p_smoothness = 'intermediate'                                   THEN 'partial'
        WHEN p_surface = ANY(ARRAY['sett','concrete:lanes','compacted','fine_gravel']) THEN 'partial'
        WHEN p_surface = ANY(ARRAY['cobblestone','unhewn_cobblestone','pebblestone'])
         AND p_smoothness = ANY(ARRAY['good','excellent'])                   THEN 'partial'
        ELSE 'full'
      END
    ELSE 'unknown'
  END
$$;
`);
console.log('✓ segment_rating() updated — incline no longer affects rating');
await c.end();
