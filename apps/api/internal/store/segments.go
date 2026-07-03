package store

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

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
	VerifyStatus     string   `json:"verifyStatus"`
	Rating           string   `json:"rating"` // "full" | "partial" | "none" | "unknown"
	GeoJSON          string   `json:"geojson"` // ST_AsGeoJSON result (LineString geometry)
}

const segmentsInBBoxSQL = `
select id::text, street_name, sidewalk_width_m, surface_type, incline_percent,
       has_tactile_paving, is_step_free, has_curb_cuts, has_ramp, lit,
       verify_status, rating, geojson
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
		if err := rows.Scan(
			&seg.ID, &seg.StreetName, &seg.SidewalkWidthM, &seg.SurfaceType,
			&seg.InclinePercent, &seg.HasTactilePaving, &seg.IsStepFree, &seg.HasCurbCuts,
			&seg.HasRamp, &seg.Lit, &seg.VerifyStatus, &seg.Rating, &seg.GeoJSON,
		); err != nil {
			return nil, err
		}
		out = append(out, seg)
	}
	return out, rows.Err()
}
