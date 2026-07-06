package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// AccessibleRoute is the pgRouting result for wheelchair-accessible routing.
type AccessibleRoute struct {
	Coordinates   [][]float64        `json:"coordinates"`
	DistanceM     float64            `json:"distance_m"`
	RatingSummary map[string]float64 `json:"rating_summary"`
	Error         string             `json:"error,omitempty"`
}

// RouteAccessible calls the route_accessible() pgRouting RPC and returns the
// path as a list of [lng,lat] coordinates. Returns an error when the DB
// function signals no_route_found or no_graph_near_points.
func (s *Store) RouteAccessible(ctx context.Context, startLng, startLat, endLng, endLat float64) (*AccessibleRoute, error) {
	var raw []byte
	err := s.db.WithAnon(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`select route_accessible($1, $2, $3, $4)`,
			startLng, startLat, endLng, endLat,
		).Scan(&raw)
	})
	if err != nil {
		return nil, fmt.Errorf("route_accessible query: %w", err)
	}
	var ar AccessibleRoute
	if err := json.Unmarshal(raw, &ar); err != nil {
		return nil, fmt.Errorf("route_accessible decode: %w", err)
	}
	if ar.Error != "" {
		return nil, fmt.Errorf("route_accessible: %s", ar.Error)
	}
	return &ar, nil
}

// StreetSegment is one surveyed walking path with accessibility attributes.
type StreetSegment struct {
	ID               string   `json:"id"`
	StreetName       string   `json:"streetName"`
	SidewalkWidthM   *float64 `json:"sidewalkWidthM"`
	SurfaceType      *string  `json:"surfaceType"`
	InclinePercent   *float64 `json:"inclinePercent"`
	HasTactilePaving *bool    `json:"hasTactilePaving"`
	IsStepFree       *bool    `json:"isStepFree"`
	HasCurbCuts      *bool    `json:"hasCurbCuts"`
	HasRamp          *bool    `json:"hasRamp"`
	Lit              *bool    `json:"lit"`
	IsObstacleFree   *bool    `json:"isObstacleFree"`
	Smoothness       *string  `json:"smoothness"`
	VerifyStatus     string   `json:"verifyStatus"`
	Rating           string   `json:"rating"` // "full" | "partial" | "none" | "unknown"
	// FieldSources maps each populated field to its provenance: osm|dem|gov|user.
	FieldSources map[string]string `json:"fieldSources"`
	GeoJSON      string            `json:"geojson"` // ST_AsGeoJSON result (LineString geometry)
}

const segmentsInBBoxSQL = `
select id::text, street_name, sidewalk_width_m, surface_type, incline_percent,
       has_tactile_paving, is_step_free, has_curb_cuts, has_ramp, lit,
       is_obstacle_free, smoothness, verify_status, rating, field_sources, geojson
from segments_in_bbox($1, $2, $3, $4)`

// NewSegment is the validated input for submitting a street segment.
type NewSegment struct {
	StreetName       string
	Coords           [][2]float64 // [[lng, lat], ...] — at least 2 points
	SidewalkWidthM   *float64
	SurfaceType      string // "" → NULL
	InclinePercent   *float64
	HasTactilePaving *bool
	IsStepFree       *bool
	HasCurbCuts      *bool
	HasRamp          *bool
	Lit              *bool
}

func coordsToWKT(coords [][2]float64) string {
	pts := make([]string, len(coords))
	for i, c := range coords {
		pts[i] = fmt.Sprintf("%.7f %.7f", c[0], c[1])
	}
	return "LINESTRING(" + strings.Join(pts, ",") + ")"
}

const addSegmentSQL = `
insert into street_segments
  (street_name, geom, sidewalk_width_m, surface_type, incline_percent,
   has_tactile_paving, is_step_free, has_curb_cuts, has_ramp, lit, created_by)
values
  ($1, ST_GeomFromText($2, 4326), $3, $4, $5, $6, $7, $8, $9, $10, auth.uid())
returning id::text`

// AddSegment inserts a street segment owned by userID. created_by is forced to
// auth.uid() in SQL so RLS rejects any attempt to forge ownership.
func (s *Store) AddSegment(ctx context.Context, userID string, in NewSegment) (string, error) {
	var id string
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, addSegmentSQL,
			in.StreetName, coordsToWKT(in.Coords),
			in.SidewalkWidthM, nullable(in.SurfaceType), in.InclinePercent,
			in.HasTactilePaving, in.IsStepFree, in.HasCurbCuts, in.HasRamp, in.Lit,
		).Scan(&id)
	})
	return id, classify(err)
}

const segmentMidpointsSQL = `
select
  ST_X(ST_LineInterpolatePoint(geom, 0.5)) as lng,
  ST_Y(ST_LineInterpolatePoint(geom, 0.5)) as lat
from street_segments
where geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
  and segment_rating(surface_type, smoothness, sidewalk_width_m, incline_percent, is_step_free) = any($5)
limit $6`

// SegmentMidpointsInBBox returns midpoints of segments in the bbox whose rating is
// in `ratings` — used to build ORS avoid_polygons so the fallback steers clear of
// impassable ("none") and, in strict mode, marginal ("partial") segments. `limit`
// caps the count so we never hand ORS an avoid set large enough to fail the request.
func (s *Store) SegmentMidpointsInBBox(ctx context.Context, minLng, minLat, maxLng, maxLat float64, ratings []string, limit int) ([]LngLat, error) {
	rows, err := s.db.Pool.Query(ctx, segmentMidpointsSQL, minLng, minLat, maxLng, maxLat, ratings, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LngLat
	for rows.Next() {
		var p LngLat
		if err := rows.Scan(&p.Lng, &p.Lat); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SegmentsInBBox returns street segments whose geometry intersects the bounding box.
func (s *Store) SegmentsInBBox(ctx context.Context, minLng, minLat, maxLng, maxLat float64) ([]StreetSegment, error) {
	rows, err := s.db.Pool.Query(ctx, segmentsInBBoxSQL, minLng, minLat, maxLng, maxLat)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []StreetSegment{}
	for rows.Next() {
		var seg StreetSegment
		var fieldSources []byte
		if err := rows.Scan(
			&seg.ID, &seg.StreetName, &seg.SidewalkWidthM, &seg.SurfaceType,
			&seg.InclinePercent, &seg.HasTactilePaving, &seg.IsStepFree, &seg.HasCurbCuts,
			&seg.HasRamp, &seg.Lit, &seg.IsObstacleFree, &seg.Smoothness, &seg.VerifyStatus, &seg.Rating,
			&fieldSources, &seg.GeoJSON,
		); err != nil {
			return nil, err
		}
		if len(fieldSources) > 0 {
			_ = json.Unmarshal(fieldSources, &seg.FieldSources)
		}
		out = append(out, seg)
	}
	return out, rows.Err()
}
