package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// ConfirmResult is the state of a problem after a confirmation.
type ConfirmResult struct {
	Confirmations int    `json:"confirmations"`
	Status        string `json:"status"`
}

// ConfirmProblem records the caller's confirmation of a problem. The DB trigger
// keeps problems.confirmations in sync; we read it back in the same tx. Returns
// ErrConflict if the user already confirmed, ErrNotFound if the problem is gone.
func (s *Store) ConfirmProblem(ctx context.Context, userID, problemID string) (ConfirmResult, error) {
	var res ConfirmResult
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			"insert into problem_confirmations (problem_id, user_id) values ($1::uuid, auth.uid())",
			problemID); err != nil {
			return err
		}
		return tx.QueryRow(ctx,
			"select confirmations, status::text from problems where id = $1::uuid", problemID).
			Scan(&res.Confirmations, &res.Status)
	})
	return res, classify(err)
}

// NewPetition is validated input for creating a petition.
type NewPetition struct {
	ProblemID   string
	Scope       string // internal | official
	Title       string
	Body        string // "" → NULL
	OfficialURL string // "" → NULL
}

// Petition is a petition row returned to clients.
type Petition struct {
	ID                 string    `json:"id"`
	ProblemID          string    `json:"problem_id"`
	Scope              string    `json:"scope"`
	Title              string    `json:"title"`
	Status             string    `json:"status"`
	InternalSignatures int       `json:"internal_signatures"`
	CreatedAt          time.Time `json:"created_at"`
}

const insertPetitionSQL = `
insert into petitions (problem_id, scope, title, body, official_url, created_by)
values ($1::uuid, $2::petition_scope, $3, $4, $5, auth.uid())
returning id::text, problem_id::text, scope::text, title, status, internal_signatures, created_at`

// CreatePetition inserts a petition owned by the caller. ErrNotFound if the
// referenced problem does not exist.
func (s *Store) CreatePetition(ctx context.Context, userID string, in NewPetition) (Petition, error) {
	var p Petition
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, insertPetitionSQL,
			in.ProblemID, in.Scope, in.Title, nullable(in.Body), nullable(in.OfficialURL)).
			Scan(&p.ID, &p.ProblemID, &p.Scope, &p.Title, &p.Status, &p.InternalSignatures, &p.CreatedAt)
	})
	return p, classify(err)
}

// LngLat is a coordinate pair (lng, lat).
type LngLat struct {
	Lng float64 `json:"lng"`
	Lat float64 `json:"lat"`
}

const barriersInBBoxSQL = `
select lng, lat from problems_in_bbox($1, $2, $3, $4)
where status::text in ('confirmed', 'escalated')`

// BarriersInBBox returns the locations of confirmed/escalated problems in a box —
// the live barriers the router should avoid. Public read (no RLS round-trip).
func (s *Store) BarriersInBBox(ctx context.Context, minLng, minLat, maxLng, maxLat float64) ([]LngLat, error) {
	rows, err := s.db.Pool.Query(ctx, barriersInBBoxSQL, minLng, minLat, maxLng, maxLat)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []LngLat{}
	for rows.Next() {
		var p LngLat
		if err := rows.Scan(&p.Lng, &p.Lat); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ProblemListItem is a problem row for public list views (with the linked
// point's name resolved server-side).
type ProblemListItem struct {
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	Description   *string   `json:"description"`
	Status        string    `json:"status"`
	Severity      int       `json:"severity"`
	Confirmations int       `json:"confirmations"`
	Photos        []string  `json:"photos"`
	PointName     *string   `json:"point_name"`
	CreatedAt     time.Time `json:"created_at"`
}

const listProblemsSQL = `
select p.id::text, p.title, p.description, p.status::text, p.severity,
       p.confirmations, coalesce(p.photos, '{}'), pt.name, p.created_at
from problems p
left join points pt on pt.id = p.point_id
order by p.confirmations desc, p.created_at desc`

// ListProblems returns all problems, most-confirmed first. Public read.
func (s *Store) ListProblems(ctx context.Context) ([]ProblemListItem, error) {
	rows, err := s.db.Pool.Query(ctx, listProblemsSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanProblemList(rows)
}

func scanProblemList(rows pgx.Rows) ([]ProblemListItem, error) {
	out := []ProblemListItem{}
	for rows.Next() {
		var p ProblemListItem
		if err := rows.Scan(&p.ID, &p.Title, &p.Description, &p.Status, &p.Severity,
			&p.Confirmations, &p.Photos, &p.PointName, &p.CreatedAt); err != nil {
			return nil, err
		}
		if p.Photos == nil {
			p.Photos = []string{}
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ProblemMarker is a located problem for the map layer.
type ProblemMarker struct {
	ID            string  `json:"id"`
	Title         string  `json:"title"`
	Status        string  `json:"status"`
	Severity      int     `json:"severity"`
	Confirmations int     `json:"confirmations"`
	Lng           float64 `json:"lng"`
	Lat           float64 `json:"lat"`
}

const problemsInBBoxSQL = `
select id::text, title, status::text, severity, confirmations, lng, lat
from problems_in_bbox($1, $2, $3, $4)`

// ProblemsInBBox returns located problems inside a bounding box. Public read.
func (s *Store) ProblemsInBBox(ctx context.Context, minLng, minLat, maxLng, maxLat float64) ([]ProblemMarker, error) {
	rows, err := s.db.Pool.Query(ctx, problemsInBBoxSQL, minLng, minLat, maxLng, maxLat)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ProblemMarker{}
	for rows.Next() {
		var m ProblemMarker
		if err := rows.Scan(&m.ID, &m.Title, &m.Status, &m.Severity, &m.Confirmations, &m.Lng, &m.Lat); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// PetitionDetail is a petition as shown on a problem page.
type PetitionDetail struct {
	ID                     string  `json:"id"`
	Scope                  string  `json:"scope"`
	Title                  string  `json:"title"`
	Body                   *string `json:"body"`
	OfficialURL            *string `json:"official_url"`
	InternalSignatures     int     `json:"internal_signatures"`
	OfficialSignatureCount *int    `json:"official_signature_count"`
	Status                 string  `json:"status"`
}

// ProblemDetail is a problem page payload: the problem + its petition (if any).
type ProblemDetail struct {
	Problem  ProblemListItem `json:"problem"`
	Petition *PetitionDetail `json:"petition"`
}

const problemByIDSQL = `
select p.id::text, p.title, p.description, p.status::text, p.severity,
       p.confirmations, coalesce(p.photos, '{}'), pt.name, p.created_at
from problems p
left join points pt on pt.id = p.point_id
where p.id = $1::uuid`

const petitionForProblemSQL = `
select id::text, scope::text, title, body, official_url,
       internal_signatures, official_signature_count, status
from petitions
where problem_id = $1::uuid
order by created_at desc
limit 1`

// ProblemByID returns one problem with its petition, or (nil, nil) if absent.
func (s *Store) ProblemByID(ctx context.Context, id string) (*ProblemDetail, error) {
	var d ProblemDetail
	p := &d.Problem
	err := s.db.Pool.QueryRow(ctx, problemByIDSQL, id).Scan(
		&p.ID, &p.Title, &p.Description, &p.Status, &p.Severity,
		&p.Confirmations, &p.Photos, &p.PointName, &p.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if p.Photos == nil {
		p.Photos = []string{}
	}

	var pet PetitionDetail
	err = s.db.Pool.QueryRow(ctx, petitionForProblemSQL, id).Scan(
		&pet.ID, &pet.Scope, &pet.Title, &pet.Body, &pet.OfficialURL,
		&pet.InternalSignatures, &pet.OfficialSignatureCount, &pet.Status)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		// no petition yet — fine
	case err != nil:
		return nil, err
	default:
		d.Petition = &pet
	}
	return &d, nil
}

// ProblemViewerState reflects the caller's own interactions with a problem —
// whether they already confirmed it / signed its petition (drives button state).
type ProblemViewerState struct {
	Confirmed bool `json:"confirmed"`
	Signed    bool `json:"signed"`
}

const problemViewerStateSQL = `
select
  exists(select 1 from problem_confirmations
         where problem_id = $1::uuid and user_id = auth.uid()),
  exists(select 1 from petition_signatures ps
         join petitions p on p.id = ps.petition_id
         where p.problem_id = $1::uuid and ps.user_id = auth.uid())`

// ProblemViewerState returns the caller's confirmation/signature state for one
// problem.
func (s *Store) ProblemViewerState(ctx context.Context, userID, problemID string) (ProblemViewerState, error) {
	var st ProblemViewerState
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, problemViewerStateSQL, problemID).Scan(&st.Confirmed, &st.Signed)
	})
	return st, classify(err)
}

// SignResult is the petition signature tally after signing.
type SignResult struct {
	Signatures int `json:"signatures"`
}

// SignPetition records the caller's signature. ErrConflict if already signed,
// ErrNotFound if the petition is gone.
func (s *Store) SignPetition(ctx context.Context, userID, petitionID string) (SignResult, error) {
	var res SignResult
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			"insert into petition_signatures (petition_id, user_id) values ($1::uuid, auth.uid())",
			petitionID); err != nil {
			return err
		}
		return tx.QueryRow(ctx,
			"select count(*) from petition_signatures where petition_id = $1::uuid", petitionID).
			Scan(&res.Signatures)
	})
	return res, classify(err)
}
