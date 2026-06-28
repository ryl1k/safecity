package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// PointSummary is a map/list point with its feature values. Field names match the
// web's @safecity/shared PointSummary so the rating engine consumes it unchanged.
type PointSummary struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Category     string            `json:"category"`
	Address      *string           `json:"address"`
	Lng          float64           `json:"lng"`
	Lat          float64           `json:"lat"`
	VerifyStatus string            `json:"verifyStatus"`
	DistanceM    *float64          `json:"distanceM,omitempty"`
	Features     map[string]string `json:"features"`
}

// PointDetail adds description + photos for the detail view.
type PointDetail struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Category     string            `json:"category"`
	Address      *string           `json:"address"`
	Description  *string           `json:"description"`
	Photos       []string          `json:"photos"`
	Lng          float64           `json:"lng"`
	Lat          float64           `json:"lat"`
	VerifyStatus string            `json:"verifyStatus"`
	Features     map[string]string `json:"features"`
}

// Reads are public (guest-first; RLS read_all). They reuse the existing PostGIS
// RPCs and cast uuid/enum columns to text so they scan into plain Go strings.

const pointsNearSQL = `
select id::text, name, category::text, address, lng, lat, verify_status::text, distance_m, features
from points_near($1, $2, $3)`

const pointsInBBoxSQL = `
select id::text, name, category::text, address, lng, lat, verify_status::text, features
from points_in_bbox($1, $2, $3, $4)`

const pointDetailSQL = `
select id::text, name, category::text, address, description, photos, lng, lat, verify_status::text, features
from point_detail($1)`

// PointsNear returns points within radiusM metres of (lng,lat), nearest first.
func (s *Store) PointsNear(ctx context.Context, lng, lat, radiusM float64) ([]PointSummary, error) {
	rows, err := s.db.Pool.Query(ctx, pointsNearSQL, lng, lat, radiusM)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []PointSummary{}
	for rows.Next() {
		var p PointSummary
		if err := rows.Scan(&p.ID, &p.Name, &p.Category, &p.Address,
			&p.Lng, &p.Lat, &p.VerifyStatus, &p.DistanceM, &p.Features); err != nil {
			return nil, err
		}
		ensureFeatures(&p.Features)
		out = append(out, p)
	}
	return out, rows.Err()
}

// PointsInBBox returns points whose geometry intersects the bounding box.
func (s *Store) PointsInBBox(ctx context.Context, minLng, minLat, maxLng, maxLat float64) ([]PointSummary, error) {
	rows, err := s.db.Pool.Query(ctx, pointsInBBoxSQL, minLng, minLat, maxLng, maxLat)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []PointSummary{}
	for rows.Next() {
		var p PointSummary
		if err := rows.Scan(&p.ID, &p.Name, &p.Category, &p.Address,
			&p.Lng, &p.Lat, &p.VerifyStatus, &p.Features); err != nil {
			return nil, err
		}
		ensureFeatures(&p.Features)
		out = append(out, p)
	}
	return out, rows.Err()
}

// PointDetail returns a single point, or (nil, nil) if not found.
func (s *Store) PointDetail(ctx context.Context, id string) (*PointDetail, error) {
	var p PointDetail
	err := s.db.Pool.QueryRow(ctx, pointDetailSQL, id).Scan(
		&p.ID, &p.Name, &p.Category, &p.Address, &p.Description, &p.Photos,
		&p.Lng, &p.Lat, &p.VerifyStatus, &p.Features)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	ensureFeatures(&p.Features)
	if p.Photos == nil {
		p.Photos = []string{}
	}
	return &p, nil
}

func ensureFeatures(m *map[string]string) {
	if *m == nil {
		*m = map[string]string{}
	}
}
