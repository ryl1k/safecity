// Package integration runs the API's data layer against a real Postgres+PostGIS
// in a throwaway container (testcontainers): it applies the actual Supabase
// migrations on top of a small auth shim (auth.users + auth.uid() + the
// anon/authenticated roles), then asserts RLS behavior end-to-end.
//
// Skips automatically when Docker is unavailable.
package integration

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/safecity/api/internal/db"
	"github.com/safecity/api/internal/store"
)

var (
	testDB     *db.DB
	skipReason string
)

// bootstrap recreates the Supabase-isms the migrations depend on, so the vanilla
// PostGIS image can run them: the anon/authenticated roles, an auth schema with
// a users table, and auth.uid() reading request.jwt.claims (as Supabase does).
const bootstrap = `
create extension if not exists postgis;
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
grant anon, authenticated to postgres;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant select on auth.users to anon, authenticated;
`

func TestMain(m *testing.M) {
	os.Exit(runSuite(m))
}

func runSuite(m *testing.M) int {
	ctx := context.Background()
	// pgrouting/pgrouting bundles PostGIS 3.4 (same as postgis/postgis:16-3.4) plus
	// pgRouting, which migration 0022_pgrouting requires (`create extension pgrouting`).
	ctr, err := tcpostgres.Run(ctx, "pgrouting/pgrouting:16-3.4-3.6.1",
		tcpostgres.WithDatabase("safecity"),
		tcpostgres.WithUsername("postgres"),
		tcpostgres.WithPassword("postgres"),
		testcontainers.WithWaitStrategy(
			wait.ForListeningPort("5432/tcp").WithStartupTimeout(90*time.Second),
		),
	)
	if err != nil {
		skipReason = "docker/testcontainers unavailable: " + err.Error()
		return m.Run()
	}
	defer func() { _ = ctr.Terminate(ctx) }()

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		skipReason = "connection string: " + err.Error()
		return m.Run()
	}

	if err := applySchema(ctx, dsn); err != nil {
		fmt.Println("schema setup failed:", err)
		return 1 // a real failure (docker is up) — surface it
	}

	testDB, err = db.New(ctx, dsn)
	if err != nil {
		fmt.Println("db.New:", err)
		return 1
	}
	defer testDB.Close()

	return m.Run()
}

func applySchema(ctx context.Context, dsn string) error {
	conn, err := connectWithRetry(ctx, dsn)
	if err != nil {
		return err
	}
	defer func() { _ = conn.Close(ctx) }()

	if _, err := conn.Exec(ctx, bootstrap); err != nil {
		return fmt.Errorf("bootstrap: %w", err)
	}

	dir := filepath.Join("..", "..", "..", "..", "supabase", "migrations")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	var files []string
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".sql") {
			continue
		}
		if strings.Contains(name, "storage") {
			continue // Supabase storage schema isn't present in the container
		}
		files = append(files, name)
	}
	sort.Strings(files)

	for _, name := range files {
		sqlText, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		if _, err := conn.Exec(ctx, string(sqlText)); err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
	}
	return nil
}

func connectWithRetry(ctx context.Context, dsn string) (*pgx.Conn, error) {
	var lastErr error
	for i := 0; i < 20; i++ {
		conn, err := pgx.Connect(ctx, dsn)
		if err == nil {
			if err = conn.Ping(ctx); err == nil {
				return conn, nil
			}
			_ = conn.Close(ctx)
		}
		lastErr = err
		time.Sleep(500 * time.Millisecond)
	}
	return nil, lastErr
}

// ── helpers ──────────────────────────────────────────────────────────────────

func skipIfNoDocker(t *testing.T) {
	t.Helper()
	if skipReason != "" {
		t.Skip(skipReason)
	}
}

func createUser(t *testing.T, email string) string {
	t.Helper()
	var id string
	err := testDB.Pool.QueryRow(context.Background(),
		"insert into auth.users(email) values($1) returning id::text", email).Scan(&id)
	if err != nil {
		t.Fatalf("createUser: %v", err)
	}
	return id
}

func makeModerator(t *testing.T, userID string) {
	t.Helper()
	if _, err := testDB.Pool.Exec(context.Background(),
		"update profiles set role='moderator' where id=$1::uuid", userID); err != nil {
		t.Fatalf("makeModerator: %v", err)
	}
}

func f64(v float64) *float64 { return &v }

// ── tests ────────────────────────────────────────────────────────────────────

func TestProfileAutoCreatedForNewUser(t *testing.T) {
	skipIfNoDocker(t)
	uid := createUser(t, "profile@x.test")
	var role string
	err := testDB.Pool.QueryRow(context.Background(),
		"select role::text from profiles where id=$1::uuid", uid).Scan(&role)
	if err != nil {
		t.Fatalf("profile lookup: %v", err)
	}
	if role != "user" {
		t.Fatalf("default role = %q, want user", role)
	}
}

func TestRLSDeniesCrossUserWrite(t *testing.T) {
	skipIfNoDocker(t)
	ctx := context.Background()
	a := createUser(t, "owner@x.test")
	b := createUser(t, "other@x.test")
	st := store.New(testDB)

	// A may create a problem owned by A.
	if _, err := st.CreateProblem(ctx, a, store.NewProblem{
		Title: "legit report", Severity: 1, Lat: f64(49.84), Lng: f64(24.03),
	}); err != nil {
		t.Fatalf("A's own write should succeed: %v", err)
	}

	// A may NOT forge a row owned by B — RLS WITH CHECK (auth.uid() = created_by).
	err := testDB.WithUser(ctx, a, func(tx pgx.Tx) error {
		_, e := tx.Exec(ctx,
			`insert into problems (title, geom, created_by)
			 values ('forged', ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3::uuid)`,
			24.03, 49.84, b)
		return e
	})
	if err == nil {
		t.Fatal("RLS should deny inserting created_by != auth.uid()")
	}
}

func TestOneConfirmationPerUser(t *testing.T) {
	skipIfNoDocker(t)
	ctx := context.Background()
	st := store.New(testDB)
	u := createUser(t, "confirmer@x.test")

	prob, err := st.CreateProblem(ctx, u, store.NewProblem{
		Title: "barrier", Severity: 2, Lat: f64(49.85), Lng: f64(24.04),
	})
	if err != nil {
		t.Fatalf("CreateProblem: %v", err)
	}

	r1, err := st.ConfirmProblem(ctx, u, prob.ID)
	if err != nil {
		t.Fatalf("first confirm: %v", err)
	}
	if r1.Confirmations != 1 {
		t.Fatalf("confirmations = %d, want 1 (trigger sync)", r1.Confirmations)
	}
	if _, err := st.ConfirmProblem(ctx, u, prob.ID); !errors.Is(err, store.ErrConflict) {
		t.Fatalf("second confirm: want ErrConflict, got %v", err)
	}
}

func TestModeratorOnlyUpdate(t *testing.T) {
	skipIfNoDocker(t)
	ctx := context.Background()
	st := store.New(testDB)

	owner := createUser(t, "pointowner@x.test")
	pid, err := st.AddPoint(ctx, owner, store.NewPoint{
		Name: "Test Venue", Category: "venue", Lng: 24.03, Lat: 49.84,
	})
	if err != nil {
		t.Fatalf("AddPoint: %v", err)
	}

	// A normal user can't update someone's point — RLS exposes no row to UPDATE.
	normal := createUser(t, "normal@x.test")
	var affected int64
	if err := testDB.WithUser(ctx, normal, func(tx pgx.Tx) error {
		ct, e := tx.Exec(ctx, "update points set verify_status='verified' where id=$1::uuid", pid)
		affected = ct.RowsAffected()
		return e
	}); err != nil {
		t.Fatalf("normal update tx: %v", err)
	}
	if affected != 0 {
		t.Fatalf("normal user affected %d rows, want 0 (RLS)", affected)
	}

	// A moderator can.
	mod := createUser(t, "mod@x.test")
	makeModerator(t, mod)
	if err := testDB.WithUser(ctx, mod, func(tx pgx.Tx) error {
		ct, e := tx.Exec(ctx, "update points set verify_status='verified' where id=$1::uuid", pid)
		affected = ct.RowsAffected()
		return e
	}); err != nil {
		t.Fatalf("moderator update tx: %v", err)
	}
	if affected != 1 {
		t.Fatalf("moderator affected %d rows, want 1", affected)
	}
}

func TestPointReadRoundTrip(t *testing.T) {
	skipIfNoDocker(t)
	ctx := context.Background()
	st := store.New(testDB)

	owner := createUser(t, "reader@x.test")
	if _, err := st.AddPoint(ctx, owner, store.NewPoint{
		Name: "Near Venue", Category: "venue", Lng: 24.0316, Lat: 49.8419,
		Features: map[string]string{"step_free_entrance": "yes"},
	}); err != nil {
		t.Fatalf("AddPoint: %v", err)
	}

	near, err := st.PointsNear(ctx, 24.0316, 49.8419, 500)
	if err != nil {
		t.Fatalf("PointsNear: %v", err)
	}
	found := false
	for _, p := range near {
		if p.Name == "Near Venue" && p.Features["step_free_entrance"] == "yes" {
			found = true
		}
	}
	if !found {
		t.Fatalf("added point not returned by PointsNear (%d results)", len(near))
	}
}
