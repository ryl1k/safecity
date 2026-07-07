// Package db owns the Postgres connection pool and the RLS-via-claims helpers.
package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"

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
	// Run against Supabase's TRANSACTION-mode pooler (port 6543): it holds a
	// server connection only for the duration of a transaction, so many clients
	// multiplex over few backends — the right fit for a web API. Our RLS setup
	// (`set local role` + jwt claims) all happens inside WithUser/inTx, so it is
	// transaction-scoped and fully compatible. Transaction pooling cannot persist
	// server-side prepared statements across checkouts, so disable statement
	// caching (unnamed exec) — otherwise pgx errors with "prepared statement
	// already exists".
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	// Supabase's SESSION-mode pooler caps total clients at pool_size (15 by
	// default). pgxpool's default MaxConns is max(4, numCPU), which on a busy
	// page load (several concurrent authed queries) can blow past that cap and
	// return `FATAL: max clients reached (EMAXCONNSESSION)` — surfacing as flaky
	// 500s. Cap our pool below the pooler limit, and release idle connections so
	// we don't hoard pooler slots. DB_MAX_CONNS overrides for other pool sizes.
	cfg.MaxConns = int32(envInt("DB_MAX_CONNS", 8))
	cfg.MinConns = 0
	cfg.MaxConnIdleTime = 30 * time.Second
	cfg.MaxConnLifetime = 30 * time.Minute
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

// envInt reads a non-negative int env var, falling back to def.
func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return def
}

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

// Role returns the user's application role from profiles (user/trusted/moderator).
// It reads as the user so RLS allows self-reads; a missing profile row defaults to
// "user". Satisfies auth.RoleResolver.
func (d *DB) Role(ctx context.Context, userID string) (string, error) {
	var role string
	err := d.WithUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, "select role from profiles where id = $1", userID).Scan(&role)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return "user", nil
	}
	if err != nil {
		return "", err
	}
	return role, nil
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
