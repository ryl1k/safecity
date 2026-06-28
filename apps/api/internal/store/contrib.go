package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
)

// NewPoint is validated input for adding a crowdsourced point.
type NewPoint struct {
	Name        string
	Category    string // point_category
	Lng, Lat    float64
	Address     string            // "" → NULL
	Description string            // "" → NULL
	Features    map[string]string // feature_key → yes|no|unknown
	Photos      []string          // Storage URLs (uploaded client-side)
}

const addPointSQL = `select add_point($1, $2::point_category, $3, $4, $5, $6, $7::jsonb, $8::text[])`

// AddPoint inserts a point (+ its feature values) via the add_point RPC, which
// forces created_by = auth.uid() and filters feature values to yes/no/unknown.
// Returns the new point id.
func (s *Store) AddPoint(ctx context.Context, userID string, in NewPoint) (string, error) {
	featuresJSON := []byte("{}")
	if len(in.Features) > 0 {
		b, err := json.Marshal(in.Features)
		if err != nil {
			return "", err
		}
		featuresJSON = b
	}

	var id string
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, addPointSQL,
			in.Name, in.Category, in.Lng, in.Lat,
			nullable(in.Address), nullable(in.Description),
			string(featuresJSON), in.Photos,
		).Scan(&id)
	})
	return id, classify(err)
}

// NewReview is validated input for rating a point for one accessibility profile.
type NewReview struct {
	Profile string // wheelchair | blind
	Stars   int    // 1..5
	Text    string // "" → NULL
	Photos  []string
}

// Review is a review row returned to clients.
type Review struct {
	ID        string    `json:"id"`
	PointID   string    `json:"point_id"`
	Profile   string    `json:"profile"`
	Stars     int       `json:"stars"`
	Text      *string   `json:"text"`
	Photos    []string  `json:"photos"`
	CreatedAt time.Time `json:"created_at"`
}

const upsertReviewSQL = `
insert into reviews (point_id, user_id, profile, stars, text, photos)
values ($1::uuid, auth.uid(), $2::profile_type, $3, $4, $5::text[])
on conflict (point_id, user_id, profile)
  do update set stars = excluded.stars, text = excluded.text, photos = excluded.photos
returning id::text, point_id::text, profile::text, stars, text, photos, created_at`

// UpsertReview creates or replaces the caller's review of a point for one profile
// (unique per point+user+profile). user_id is forced to auth.uid(). ErrNotFound
// if the point does not exist.
func (s *Store) UpsertReview(ctx context.Context, userID, pointID string, in NewReview) (Review, error) {
	var rv Review
	photos := in.Photos
	if photos == nil {
		photos = []string{}
	}
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, upsertReviewSQL,
			pointID, in.Profile, in.Stars, nullable(in.Text), photos).
			Scan(&rv.ID, &rv.PointID, &rv.Profile, &rv.Stars, &rv.Text, &rv.Photos, &rv.CreatedAt)
	})
	return rv, classify(err)
}
