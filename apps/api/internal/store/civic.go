package store

import (
	"context"
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
