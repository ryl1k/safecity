package store

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/joho/godotenv"

	"github.com/safecity/api/internal/db"
)

// TestCreateProblemIntegration exercises the full write path against the real
// Supabase Postgres: store → RLS-via-claims tx → insert with created_by =
// auth.uid() → PostGIS geom round-trip. Skipped when DATABASE_URL is unset (CI
// without a DB); the dedicated testcontainers task adds hermetic coverage.
func TestCreateProblemIntegration(t *testing.T) {
	_ = godotenv.Load("../../../../.env") // repo-root .env for local runs
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping DB integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	database, err := db.New(ctx, dsn)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer database.Close()

	var uid string
	if err := database.Pool.QueryRow(ctx,
		"select id::text from auth.users order by created_at limit 1").Scan(&uid); err != nil {
		t.Skipf("no seeded user in auth.users: %v", err)
	}

	st := New(database)
	lat, lng := 49.8401, 24.0301
	got, err := st.CreateProblem(ctx, uid, NewProblem{
		Title:       "integration test problem",
		Description: "created by go test",
		Category:    "crossing",
		Severity:    2,
		Lat:         &lat,
		Lng:         &lng,
	})
	if err != nil {
		t.Fatalf("CreateProblem: %v", err)
	}
	defer func() { // clean up via the pool (bypasses RLS) regardless of assertions
		if got.ID != "" {
			_, _ = database.Pool.Exec(ctx, "delete from problems where id = $1", got.ID)
		}
	}()

	if got.ID == "" {
		t.Fatal("no id returned")
	}
	if got.CreatedBy != uid {
		t.Fatalf("created_by = %q, want %q (RLS-claims not applied?)", got.CreatedBy, uid)
	}
	if got.Status != "reported" {
		t.Fatalf("status = %q, want reported", got.Status)
	}
	if got.Severity != 2 {
		t.Fatalf("severity = %d, want 2", got.Severity)
	}
	if got.Category == nil || *got.Category != "crossing" {
		t.Fatalf("category = %v, want crossing", got.Category)
	}
	if got.Lat == nil || got.Lng == nil {
		t.Fatal("lat/lng not returned from geom")
	}
	if abs(*got.Lat-lat) > 1e-6 || abs(*got.Lng-lng) > 1e-6 {
		t.Fatalf("geom round-trip = %v,%v want %v,%v", *got.Lat, *got.Lng, lat, lng)
	}
}

func abs(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}
