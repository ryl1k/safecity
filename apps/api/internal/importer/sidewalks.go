package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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
	StreetName     string
	Coords         [][2]float64 // [[lng, lat], ...], at least 2 points
	SurfaceType    *string
	Lit            *bool
	IsStepFree     *bool
	InclinePercent *float64
	HasCurbCuts    *bool
	VerifyStatus   string
	OSMWayID       int64
}

func sidewalkQuery(bbox string) string {
	return fmt.Sprintf(`[out:json][timeout:90];
(
  way["highway"="footway"]["footway"="sidewalk"](%[1]s);
  way["sidewalk"](%[1]s);
);
out geom;`, bbox)
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

// mapSidewalkWay converts an Overpass way element to a SegmentRecord.
// ok is false when the way has no name or fewer than 2 geometry points.
func mapSidewalkWay(el SidewalkElement) (SegmentRecord, bool) {
	t := el.Tags
	if t == nil {
		t = map[string]string{}
	}
	name := t["name"]
	if name == "" || len(el.Geometry) < 2 {
		return SegmentRecord{}, false
	}
	coords := make([][2]float64, len(el.Geometry))
	for i, pt := range el.Geometry {
		coords[i] = [2]float64{pt.Lon, pt.Lat}
	}
	rec := SegmentRecord{
		StreetName:   name,
		Coords:       coords,
		SurfaceType:  strptr(t["surface"]),
		Lit:          strToBoolPtr(bin(t["lit"])),
		IsStepFree:   strToBoolPtr(tri(t["wheelchair"])),
		HasCurbCuts:  kerbToHasCurbCuts(t["kerb"]),
		VerifyStatus: "verified",
		OSMWayID:     el.ID,
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

const upsertSegmentSQL = `
insert into street_segments
  (street_name, geom, osm_way_id, surface_type, incline_percent,
   is_step_free, has_curb_cuts, lit, verify_status)
values
  ($1, ST_GeomFromText($2, 4326), $3, $4, $5, $6, $7, $8, $9)
on conflict (osm_way_id) where osm_way_id is not null
do update set street_name = excluded.street_name, geom = excluded.geom,
              surface_type = coalesce(excluded.surface_type, street_segments.surface_type),
              incline_percent = coalesce(excluded.incline_percent, street_segments.incline_percent),
              is_step_free = coalesce(excluded.is_step_free, street_segments.is_step_free),
              has_curb_cuts = coalesce(excluded.has_curb_cuts, street_segments.has_curb_cuts),
              lit = coalesce(excluded.lit, street_segments.lit),
              updated_at = now()
returning id::text`

// upsertSegment inserts/updates a street segment keyed on osm_way_id and returns its id.
func upsertSegment(ctx context.Context, pool *pgxpool.Pool, rec SegmentRecord) (string, error) {
	var id string
	err := pool.QueryRow(ctx, upsertSegmentSQL,
		rec.StreetName, segmentCoordsToWKT(rec.Coords), rec.OSMWayID,
		rec.SurfaceType, rec.InclinePercent, rec.IsStepFree, rec.HasCurbCuts, rec.Lit, rec.VerifyStatus,
	).Scan(&id)
	return id, err
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

// ImportSidewalksNational seeds street segments across the same 75
// government-controlled cities used for the points showcase (Cities, mirrored
// from apps/web/src/lib/cities.ts), capping each city at perCity segments
// (<=0 uses DefaultPerCity). Politely rate-limited between cities — Overpass
// is a shared public service. Stops and returns on the first city that fails;
// progress (if non-nil) is called for every city, including the failing one,
// before the error is returned.
func ImportSidewalksNational(
	ctx context.Context, pool *pgxpool.Pool, client *http.Client, endpoint string, perCity int, progress CityProgress,
) (Stats, error) {
	if endpoint == "" {
		endpoint = DefaultOverpassURL
	}
	if perCity <= 0 {
		perCity = DefaultPerCity
	}

	var total Stats
	for i, city := range Cities {
		st, err := importSidewalksBBox(ctx, pool, client, endpoint, CityBBox(city), perCity)
		if progress != nil {
			progress(city, st, err)
		}
		if err != nil {
			return total, fmt.Errorf("city %s: %w", city.ID, err)
		}
		total.Upserts += st.Upserts
		total.Skipped += st.Skipped

		if i < len(Cities)-1 {
			select {
			case <-ctx.Done():
				return total, ctx.Err()
			case <-time.After(1500 * time.Millisecond):
			}
		}
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

// importSidewalksBBox fetches, maps, and upserts sidewalks for one bbox.
// cap<=0 means unlimited; otherwise only the first cap named/geometric ways
// are kept (Overpass's own element order — no quality ranking applied).
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
	for _, rec := range recs {
		if _, err := upsertSegment(ctx, pool, rec); err != nil {
			return st, fmt.Errorf("upsert way/%d: %w", rec.OSMWayID, err)
		}
		st.Upserts++
	}
	return st, nil
}

func fetchSidewalks(ctx context.Context, client *http.Client, endpoint, bbox string) ([]SidewalkElement, error) {
	body := "data=" + url.QueryEscape(sidewalkQuery(bbox))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", userAgent)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("overpass request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return nil, fmt.Errorf("overpass %d: %s", resp.StatusCode, snippet)
	}
	var payload struct {
		Elements []SidewalkElement `json:"elements"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode overpass: %w", err)
	}
	return payload.Elements, nil
}
