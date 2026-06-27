// Package db owns the Postgres connection pool and the RLS-via-claims helpers.
package db

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DB wraps a pgx pool to the Supabase Postgres.
type DB struct {
	Pool *pgxpool.Pool
}

// New connects a pool to dsn and verifies it with a ping.
func New(ctx context.Context, dsn string) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse dsn: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &DB{Pool: pool}, nil
}

// Close releases the pool.
func (d *DB) Close() { d.Pool.Close() }

// Ping checks DB connectivity (used by the readiness probe).
func (d *DB) Ping(ctx context.Context) error { return d.Pool.Ping(ctx) }

// WithUser runs fn inside a transaction acting as the authenticated user, so
// Postgres RLS policies apply (auth.uid() resolves from the JWT claims). This is
// the pattern validated by the spike.
func (d *DB) WithUser(ctx context.Context, userID string, fn func(pgx.Tx) error) error {
	claims, err := json.Marshal(map[string]string{"sub": userID, "role": "authenticated"})
	if err != nil {
		return err
	}
	return d.inTx(ctx, "authenticated", string(claims), fn)
}

// WithAnon runs fn inside a transaction as the anon role (public reads under RLS).
func (d *DB) WithAnon(ctx context.Context, fn func(pgx.Tx) error) error {
	return d.inTx(ctx, "anon", "", fn)
}

func (d *DB) inTx(ctx context.Context, role, claims string, fn func(pgx.Tx) error) (err error) {
	tx, err := d.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	// role is a fixed internal constant ("authenticated"/"anon"), never user input.
	if _, err = tx.Exec(ctx, "set local role "+role); err != nil {
		return fmt.Errorf("set role: %w", err)
	}
	if claims != "" {
		if _, err = tx.Exec(ctx, "select set_config('request.jwt.claims', $1, true)", claims); err != nil {
			return fmt.Errorf("set claims: %w", err)
		}
	}
	if err = fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
