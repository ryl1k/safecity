package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SidewalkElement is one Overpass way returned with full node geometry
// (out geom;), needed to build a LineString — unlike OSMElement's centroid.
type SidewalkElement struct {
	Type     string `json:"type"`
	ID       int64  `json:"id"`
	Geometry []struct {
		Lat float64 `json:"lat"`
		Lon float64 `json:"lon"`
	} `json:"geometry"`
	Tags map[string]string `json:"tags"`
}

// SegmentRecord is one street segment to upsert, keyed on OSM way id.
type SegmentRecord struct {
	StreetName       string
	Coords           [][2]float64 // [[lng, lat], ...], at least 2 points
	SurfaceType      *string
	Smoothness       *string
	SidewalkWidthM   *float64
	Lit              *bool
	IsStepFree       *bool
	InclinePercent   *float64
	HasCurbCuts      *bool
	HasTactilePaving *bool
	HasRamp          *bool
	VerifyStatus     string
	OSMWayID         int64
}

// sidewalkQuery pulls all pedestrian-usable ways. area is either a bbox string
// "S,W,N,E" or an around string "around:RADIUS_M,LAT,LNG" — both are valid
// Overpass filter expressions and substituted verbatim.
// Excludes motorway/trunk/link variants and construction/proposed which are
// either inaccessible or non-existent.
func sidewalkQuery(area string) string {
	return fmt.Sprintf(`[out:json][timeout:180];
way["highway"~"^(footway|pedestrian|path|steps|cycleway|living_street|residential|service|unclassified|track|tertiary|secondary|primary|secondary_link|tertiary_link|primary_link)$"]["foot"!="no"]["access"!="private"](%s);
out geom;`, area)
}

// Surface & smoothness classes mirror segment_rating() in migration 0019. The
// Go import gate and the SQL rating MUST agree on which values are recognized,
// or a way could be imported yet rate 'unknown' — the exact signal-less junk we
// are eliminating. TestSegmentRatingGateSync asserts every recognized surface
// rates non-unknown against the live function.
var (
	surfaceGood       = strset("asphalt", "concrete", "paving_stones", "concrete:plates", "paved", "wood", "metal")
	surfacePoor       = strset("sett", "concrete:lanes", "compacted", "fine_gravel")
	surfaceImpassable = strset("cobblestone", "unhewn_cobblestone", "pebblestone", "gravel", "sand", "ground", "dirt", "earth", "grass", "mud", "unpaved", "rock")

	smoothnessGood       = strset("excellent", "good")
	smoothnessPoor       = strset("intermediate")
	smoothnessImpassable = strset("bad", "very_bad", "horrible", "very_horrible", "impassable")
)

func strset(vals ...string) map[string]bool {
	m := make(map[string]bool, len(vals))
	for _, v := range vals {
		m[v] = true
	}
	return m
}

// recognizedSurface returns a pointer to v when it is a surface we know how to
// rate, else nil — freeform/unknown values (e.g. "узбіччя_дороги") are dropped
// so they never masquerade as signal.
func recognizedSurface(v string) *string {
	if surfaceGood[v] || surfacePoor[v] || surfaceImpassable[v] {
		s := v
		return &s
	}
	return nil
}

func recognizedSmoothness(v string) *string {
	if smoothnessGood[v] || smoothnessPoor[v] || smoothnessImpassable[v] {
		s := v
		return &s
	}
	return nil
}

// allRecognizedSurfaces lists every surface the importer will store — the
// rating sync test asserts each rates non-unknown (gate/rating agreement).
func allRecognizedSurfaces() []string {
	var out []string
	for _, m := range []map[string]bool{surfaceGood, surfacePoor, surfaceImpassable} {
		for k := range m {
			out = append(out, k)
		}
	}
	return out
}

func strToBoolPtr(v string) *bool {
	switch v {
	case "yes":
		b := true
		return &b
	case "no":
		b := false
		return &b
	default:
		return nil
	}
}

func kerbToHasCurbCuts(v string) *bool {
	switch v {
	case "lowered", "flush":
		b := true
		return &b
	case "raised":
		b := false
		return &b
	default:
		return nil
	}
}

// parseInclinePercent parses an OSM incline tag value ("5%", "5", "-3.5%")
// into a percentage. ok is false for non-numeric values (e.g. "up", "down").
func parseInclinePercent(v string) (float64, bool) {
	v = strings.TrimSpace(v)
	v = strings.TrimSuffix(v, "%")
	v = strings.TrimSpace(v)
	if v == "" {
		return 0, false
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0, false
	}
	return f, true
}

// wheelchairToStepFree folds the explicit `wheelchair` tag into is_step_free:
// yes/designated → true, no → false. "limited" and absent leave it nil so the
// surface/smoothness verdict decides (segment_rating treats step_free=false as
// a hard barrier, so mapping wheelchair=no here yields 'none').
func wheelchairToStepFree(v string) *bool {
	switch v {
	case "yes", "designated":
		b := true
		return &b
	case "no":
		b := false
		return &b
	default:
		return nil
	}
}

func tactilePavingToBool(v string) *bool {
	switch v {
	case "yes", "contrasted":
		b := true
		return &b
	case "no":
		b := false
		return &b
	default:
		return nil
	}
}

// parseWidthMeters parses an OSM width value ("1.5", "1,5", "1.5 m", "2m") into
// metres. ok is false for imperial units, ranges, or non-numeric junk.
func parseWidthMeters(v string) (float64, bool) {
	v = strings.ToLower(strings.TrimSpace(v))
	if v == "" || strings.ContainsAny(v, "'\"") || strings.Contains(v, "ft") {
		return 0, false // imperial — out of scope
	}
	for _, unit := range []string{"meters", "metres", "meter", "metre", "m"} {
		if strings.HasSuffix(v, unit) {
			v = strings.TrimSpace(strings.TrimSuffix(v, unit))
			break
		}
	}
	v = strings.ReplaceAll(v, ",", ".")
	if strings.ContainsAny(v, "-;~ ") {
		return 0, false // ranges / lists / stray tokens
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil || f <= 0 || f > 20 {
		return 0, false
	}
	return f, true
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// segmentName uses the OSM `name` when present, else a generic Ukrainian label
// by way type.
func segmentName(t map[string]string) string {
	if n := strings.TrimSpace(t["name"]); n != "" {
		return n
	}
	switch t["highway"] {
	case "steps":
		return "Сходи"
	case "cycleway":
		return "Велодоріжка"
	case "living_street":
		return "Житлова зона"
	case "pedestrian":
		return "Пішохідна зона"
	case "residential", "service", "unclassified", "tertiary", "tertiary_link",
		"secondary", "secondary_link", "primary", "primary_link":
		return "Вулиця"
	case "track":
		return "Ґрунтова дорога"
	default:
		if t["footway"] == "sidewalk" {
			return "Тротуар"
		}
		return "Пішохідна доріжка"
	}
}

// rampTagToHasRamp reads OSM ramp:wheelchair (preferred) or generic ramp tag.
func rampTagToHasRamp(t map[string]string) *bool {
	v := t["ramp:wheelchair"]
	if v == "" {
		v = t["ramp"]
	}
	switch v {
	case "yes", "separate":
		b := true
		return &b
	case "no":
		b := false
		return &b
	}
	return nil
}

// mapSidewalkWay converts an Overpass way element to a SegmentRecord.
// All ways with at least 2 geometry points are imported regardless of tags —
// missing signals are filled later by DEM (incline) and gov dataset enrichment.
// ok is false only for ways with fewer than 2 geometry points.
func mapSidewalkWay(el SidewalkElement) (SegmentRecord, bool) {
	t := el.Tags
	if t == nil {
		t = map[string]string{}
	}
	if len(el.Geometry) < 2 {
		return SegmentRecord{}, false
	}

	coords := make([][2]float64, len(el.Geometry))
	for i, pt := range el.Geometry {
		coords[i] = [2]float64{pt.Lon, pt.Lat}
	}

	wc := t["wheelchair"]
	isStepFree := wheelchairToStepFree(wc)
	// Steps are inherently not step-free; ramp tags say whether a ramp exists.
	if t["highway"] == "steps" {
		f := false
		isStepFree = &f
	}

	rec := SegmentRecord{
		StreetName:       segmentName(t),
		Coords:           coords,
		SurfaceType:      recognizedSurface(t["surface"]),
		Smoothness:       recognizedSmoothness(t["smoothness"]),
		Lit:              strToBoolPtr(bin(t["lit"])),
		IsStepFree:       isStepFree,
		HasCurbCuts:      kerbToHasCurbCuts(t["kerb"]),
		HasTactilePaving: tactilePavingToBool(t["tactile_paving"]),
		HasRamp:          rampTagToHasRamp(t),
		VerifyStatus:     "unverified",
		OSMWayID:         el.ID,
	}
	if w := firstNonEmpty(t["width"], t["sidewalk:width"], t["est_width"]); w != "" {
		if m, ok := parseWidthMeters(w); ok {
			rec.SidewalkWidthM = &m
		}
	}
	if pct, ok := parseInclinePercent(t["incline"]); ok {
		rec.InclinePercent = &pct
	}
	return rec, true
}

func segmentCoordsToWKT(coords [][2]float64) string {
	pts := make([]string, len(coords))
	for i, c := range coords {
		pts[i] = fmt.Sprintf("%.7f %.7f", c[0], c[1])
	}
	return "LINESTRING(" + strings.Join(pts, ",") + ")"
}

// On refresh the importer OWNS every osm_way_id row, so it overwrites the
// OSM-derived fields outright (a way that lost its `surface` tag upstream should
// lose it here too) and re-asserts verify_status='unverified' — imported data
// is never human-verified.
const upsertSegmentSQL = `
insert into street_segments
  (street_name, geom, osm_way_id, surface_type, smoothness, sidewalk_width_m,
   incline_percent, is_step_free, has_curb_cuts, has_tactile_paving, has_ramp, lit, verify_status)
values
  ($1, ST_GeomFromText($2, 4326), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'unverified')
on conflict (osm_way_id) where osm_way_id is not null
do update set street_name = excluded.street_name, geom = excluded.geom,
              surface_type = excluded.surface_type, smoothness = excluded.smoothness,
              sidewalk_width_m = excluded.sidewalk_width_m,
              incline_percent = COALESCE(excluded.incline_percent, street_segments.incline_percent),
              is_step_free = excluded.is_step_free, has_curb_cuts = excluded.has_curb_cuts,
              has_tactile_paving = excluded.has_tactile_paving, has_ramp = excluded.has_ramp,
              lit = excluded.lit, verify_status = 'unverified', updated_at = now()
returning id::text`

// upsertSegment inserts/updates a street segment keyed on osm_way_id and returns its id.
func upsertSegment(ctx context.Context, pool *pgxpool.Pool, rec SegmentRecord) (string, error) {
	var id string
	err := pool.QueryRow(ctx, upsertSegmentSQL,
		rec.StreetName, segmentCoordsToWKT(rec.Coords), rec.OSMWayID,
		rec.SurfaceType, rec.Smoothness, rec.SidewalkWidthM, rec.InclinePercent,
		rec.IsStepFree, rec.HasCurbCuts, rec.HasTactilePaving, rec.HasRamp, rec.Lit,
	).Scan(&id)
	return id, err
}

// upsertSegmentBatch upserts a slice of records in one multi-row INSERT and
// returns the number of rows affected.
func upsertSegmentBatch(ctx context.Context, pool *pgxpool.Pool, recs []SegmentRecord) (int, error) {
	if len(recs) == 0 {
		return 0, nil
	}

	// Build VALUES ($1,$2,…),($13,$14,…),… with 12 params per row.
	const paramsPerRow = 12
	args := make([]any, 0, len(recs)*paramsPerRow)
	placeholders := make([]string, 0, len(recs))
	for i, r := range recs {
		base := i * paramsPerRow
		placeholders = append(placeholders, fmt.Sprintf(
			"($%d,ST_GeomFromText($%d,4326),$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,'unverified')",
			base+1, base+2, base+3, base+4, base+5, base+6,
			base+7, base+8, base+9, base+10, base+11, base+12,
		))
		args = append(args,
			r.StreetName, segmentCoordsToWKT(r.Coords), r.OSMWayID,
			r.SurfaceType, r.Smoothness, r.SidewalkWidthM, r.InclinePercent,
			r.IsStepFree, r.HasCurbCuts, r.HasTactilePaving, r.HasRamp, r.Lit,
		)
	}

	q := `insert into street_segments
  (street_name,geom,osm_way_id,surface_type,smoothness,sidewalk_width_m,
   incline_percent,is_step_free,has_curb_cuts,has_tactile_paving,has_ramp,lit,verify_status)
values ` + strings.Join(placeholders, ",") + `
on conflict (osm_way_id) where osm_way_id is not null
do update set
  street_name=excluded.street_name, geom=excluded.geom,
  surface_type=excluded.surface_type, smoothness=excluded.smoothness,
  sidewalk_width_m=excluded.sidewalk_width_m,
  incline_percent=COALESCE(excluded.incline_percent, street_segments.incline_percent),
  is_step_free=excluded.is_step_free, has_curb_cuts=excluded.has_curb_cuts,
  has_tactile_paving=excluded.has_tactile_paving, has_ramp=excluded.has_ramp,
  lit=excluded.lit, verify_status='unverified', updated_at=now()`

	tag, err := pool.Exec(ctx, q, args...)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

// PruneOSMSidewalks normalises the OSM layer after a seed run: it forces every
// OSM row to verify_status='unverified' and deletes rows with no ratable signal
// (rating 'unknown') — legacy junk from the pre-0019 importer that rated only by
// is_step_free/width. It touches ONLY osm_way_id rows; user-drawn segments
// (osm_way_id null) are never affected. Returns how many rows were flipped and
// deleted so the caller can report the cleanup transparently.
func PruneOSMSidewalks(ctx context.Context, pool *pgxpool.Pool) (flipped, deleted int64, err error) {
	tag, err := pool.Exec(ctx,
		`update street_segments set verify_status = 'unverified'
		 where osm_way_id is not null and verify_status <> 'unverified'`)
	if err != nil {
		return 0, 0, fmt.Errorf("flip verify_status: %w", err)
	}
	flipped = tag.RowsAffected()

	tag, err = pool.Exec(ctx,
		`delete from street_segments
		 where osm_way_id is not null
		   and segment_rating(surface_type, smoothness, sidewalk_width_m, incline_percent, is_step_free,
		                      lit, has_curb_cuts, has_tactile_paving, is_obstacle_free, has_ramp) = 'unknown'`)
	if err != nil {
		return flipped, 0, fmt.Errorf("delete unknown-rated: %w", err)
	}
	return flipped, tag.RowsAffected(), nil
}

// ImportSidewalks queries Overpass for sidewalk/footway geometry in bbox and
// upserts street segments (uncapped — every matching way is kept).
func ImportSidewalks(ctx context.Context, pool *pgxpool.Pool, client *http.Client, endpoint, bbox string) (Stats, error) {
	if endpoint == "" {
		endpoint = DefaultOverpassURL
	}
	if bbox == "" {
		bbox = DefaultBBox
	}
	return importSidewalksBBox(ctx, pool, client, endpoint, bbox, 0)
}

// DefaultPerCity matches tooling/importers/bezbarrier.mjs's PER_CITY default —
// the same showcase density used to seed points, so streets and points look
// comparably populated per city.
const DefaultPerCity = 35

// CityProgress reports one city's import outcome (err is non-nil on failure).
type CityProgress func(city City, st Stats, err error)

// cityDelay is the courtesy pause between cities — Overpass is a shared public
// service; back-to-back heavy queries invite throttling.
const cityDelay = 2 * time.Second

// ImportSidewalksNational seeds street segments across the same 75
// government-controlled cities used for the points showcase (Cities, mirrored
// from apps/web/src/lib/cities.ts), capping each city at perCity segments
// (<=0 uses DefaultPerCity). progress (if non-nil) is called for every city,
// including any that fail.
//
// A single city that still fails after postOverpass's retries is logged and
// skipped, not fatal — one flaky city must not discard a long run's progress
// (re-running is idempotent on osm_way_id, so it safely picks up stragglers).
// The returned error is non-nil only when the context is cancelled mid-run, or
// as an end-of-run summary naming the cities that could not be seeded.
func ImportSidewalksNational(
	ctx context.Context, pool *pgxpool.Pool, client *http.Client, endpoint string, perCity int, progress CityProgress,
) (Stats, error) {
	if endpoint == "" {
		endpoint = DefaultOverpassURL
	}
	if perCity < 0 {
		perCity = DefaultPerCity
	}
	// perCity == 0 means uncapped — keep every ratable segment per city.

	var total Stats
	var failed []string
	for i, city := range Cities {
		st, err := importSidewalksBBox(ctx, pool, client, endpoint, CityBBox(city), perCity)
		if progress != nil {
			progress(city, st, err)
		}
		if err != nil {
			if ctx.Err() != nil {
				return total, ctx.Err() // shutdown/timeout — stop the whole run
			}
			failed = append(failed, city.Name)
		} else {
			total.Upserts += st.Upserts
			total.Skipped += st.Skipped
		}

		if i < len(Cities)-1 {
			select {
			case <-ctx.Done():
				return total, ctx.Err()
			case <-time.After(cityDelay):
			}
		}
	}
	if len(failed) > 0 {
		return total, fmt.Errorf("%d/%d cities could not be seeded (re-run to retry): %s",
			len(failed), len(Cities), strings.Join(failed, ", "))
	}
	return total, nil
}

// capRecords limits recs to at most cap entries (Overpass's own element order
// — no quality ranking applied). cap<=0 means unlimited.
func capRecords(recs []SegmentRecord, cap int) []SegmentRecord {
	if cap > 0 && len(recs) > cap {
		return recs[:cap]
	}
	return recs
}

const upsertBatchSize = 500

// importSidewalksBBox fetches, maps, and upserts sidewalks for one bbox.
// cap<=0 means unlimited; otherwise only the first cap named/geometric ways
// are kept (Overpass's own element order — no quality ranking applied).
// DB writes are batched upsertBatchSize rows at a time via a single multi-row
// INSERT … ON CONFLICT to minimise round-trips.
func importSidewalksBBox(
	ctx context.Context, pool *pgxpool.Pool, client *http.Client, endpoint, bbox string, cap int,
) (Stats, error) {
	elements, err := fetchSidewalks(ctx, client, endpoint, bbox)
	if err != nil {
		return Stats{}, err
	}

	var st Stats
	recs := make([]SegmentRecord, 0, len(elements))
	for _, el := range elements {
		rec, ok := mapSidewalkWay(el)
		if !ok {
			st.Skipped++
			continue
		}
		recs = append(recs, rec)
	}
	recs = capRecords(recs, cap)

	for i := 0; i < len(recs); i += upsertBatchSize {
		end := i + upsertBatchSize
		if end > len(recs) {
			end = len(recs)
		}
		batch := recs[i:end]
		n, err := upsertSegmentBatch(ctx, pool, batch)
		if err != nil {
			return st, fmt.Errorf("upsert batch [%d:%d]: %w", i, end, err)
		}
		st.Upserts += n
	}
	return st, nil
}

func fetchSidewalks(ctx context.Context, client *http.Client, endpoint, bbox string) ([]SidewalkElement, error) {
	data, err := postOverpass(ctx, client, endpoint, sidewalkQuery(bbox))
	if err != nil {
		return nil, err
	}
	var payload struct {
		Elements []SidewalkElement `json:"elements"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, fmt.Errorf("decode overpass: %w", err)
	}
	return payload.Elements, nil
}
