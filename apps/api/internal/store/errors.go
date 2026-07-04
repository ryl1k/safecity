package store

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

// Sentinel errors the store maps Postgres constraint violations onto, so handlers
// can translate them to HTTP status codes without importing pgx.
var (
	// ErrConflict is a unique-constraint violation, e.g. confirming/signing twice.
	ErrConflict = errors.New("conflict")
	// ErrNotFound is a foreign-key violation, e.g. acting on a missing parent row.
	ErrNotFound = errors.New("not found")
	// ErrInvalid is a check-constraint violation, e.g. an out-of-range value.
	ErrInvalid = errors.New("invalid")
	// ErrPointLimit is the per-user point cap hit by a non-business user (add_point
	// raises SQLSTATE 'PT001'). Deliberately only surfaced at the moment it's hit.
	ErrPointLimit = errors.New("point limit reached")
)

// classify maps Postgres SQLSTATE codes to store sentinels; other errors pass
// through unchanged.
func classify(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return err
	}
	switch pgErr.Code {
	case "23505": // unique_violation
		return ErrConflict
	case "23503": // foreign_key_violation
		return ErrNotFound
	case "23514": // check_violation
		return ErrInvalid
	case "PT001": // custom: per-user point cap reached (add_point)
		return ErrPointLimit
	case "PT404": // custom: point not owned by caller (update_point/delete_point)
		return ErrNotFound
	default:
		return err
	}
}
