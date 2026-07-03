package store

import "context"

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
