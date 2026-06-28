// Package store is the typed data-access layer over the Postgres pool. Each
// method runs through the RLS-via-claims tx helpers so Postgres policies enforce
// authorization (the server never trusts client-supplied ownership).
package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/safecity/api/internal/db"
)

// Store provides data access backed by the connection pool.
type Store struct {
	db *db.DB
}

// New builds a Store over d.
func New(d *db.DB) *Store { return &Store{db: d} }

// NewProblem is the validated input for reporting a problem. Either PointID or
// both Lat+Lng must be set (enforced by the caller and the table CHECK).
type NewProblem struct {
	Title       string
	Description string // "" → NULL
	Category    string // "" → NULL; otherwise a point_category value
	Severity    int    // 1..3
	PointID     string // "" → NULL; otherwise a uuid
	Lat         *float64
	Lng         *float64
}

// Problem is a problem row as returned to clients.
type Problem struct {
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	Description   *string   `json:"description"`
	Category      *string   `json:"category"`
	Severity      int       `json:"severity"`
	Status        string    `json:"status"`
	Confirmations int       `json:"confirmations"`
	PointID       *string   `json:"point_id"`
	Lat           *float64  `json:"lat"`
	Lng           *float64  `json:"lng"`
	CreatedBy     string    `json:"created_by"`
	CreatedAt     time.Time `json:"created_at"`
}

const insertProblemSQL = `
insert into problems (title, description, category, severity, point_id, geom, created_by)
values (
  $1,
  $2,
  $3::point_category,
  $4::int,
  $5::uuid,
  case when $6::float8 is not null and $7::float8 is not null
       then ST_SetSRID(ST_MakePoint($7::float8, $6::float8), 4326)::geography
       else null end,
  auth.uid()
)
returning id::text, title, description, category::text, severity, status::text,
          confirmations, point_id::text, created_at,
          ST_Y(geom::geometry), ST_X(geom::geometry)`

// CreateProblem inserts a problem owned by userID. created_by is forced to
// auth.uid() in SQL, so RLS rejects any attempt to forge ownership.
func (s *Store) CreateProblem(ctx context.Context, userID string, in NewProblem) (Problem, error) {
	var p Problem
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, insertProblemSQL,
			in.Title,
			nullable(in.Description),
			nullable(in.Category),
			in.Severity,
			nullable(in.PointID),
			in.Lat,
			in.Lng,
		).Scan(
			&p.ID, &p.Title, &p.Description, &p.Category, &p.Severity,
			&p.Status, &p.Confirmations, &p.PointID, &p.CreatedAt, &p.Lat, &p.Lng,
		)
	})
	if err != nil {
		return Problem{}, err
	}
	p.CreatedBy = userID
	return p, nil
}

// nullable maps an empty string to a SQL NULL.
func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}
