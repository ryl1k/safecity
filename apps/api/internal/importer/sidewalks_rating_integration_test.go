package importer

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/joho/godotenv"

	"github.com/safecity/api/internal/db"
)

// TestSegmentRatingIntegration exercises the SQL segment_rating() function
// (migration 0019) against the real DB — the rating IS the fix, so it must be
// verified for real, not just manual-queried. Read-only (no inserts). Skipped
// when DATABASE_URL is unset. Requires 0019 to be applied.
func TestSegmentRatingIntegration(t *testing.T) {
	database := ratingTestDB(t)
	defer database.Close()
	ctx := context.Background()

	sp := func(s string) *string { return &s }
	fp := func(f float64) *float64 { return &f }
	bp := func(b bool) *bool { return &b }

	cases := []struct {
		name       string
		surface    *string
		smoothness *string
		width      *float64
		incline    *float64
		stepFree   *bool
		want       string
	}{
		{"asphalt is full", sp("asphalt"), nil, nil, nil, nil, "full"},
		{"paving_stones is full", sp("paving_stones"), nil, nil, nil, nil, "full"},
		{"concrete:plates is full", sp("concrete:plates"), nil, nil, nil, nil, "full"},
		{"sett is partial", sp("sett"), nil, nil, nil, nil, "partial"},
		// The whole point of worse-of: a smooth-tagged sett street can NOT be full.
		{"sett + smoothness=good stays partial", sp("sett"), sp("good"), nil, nil, nil, "partial"},
		{"fine_gravel is partial", sp("fine_gravel"), nil, nil, nil, nil, "partial"},
		{"compacted is partial", sp("compacted"), nil, nil, nil, nil, "partial"},
		{"cobblestone is none", sp("cobblestone"), nil, nil, nil, nil, "none"},
		{"gravel is none", sp("gravel"), nil, nil, nil, nil, "none"},
		{"asphalt + smoothness=bad is none", sp("asphalt"), sp("bad"), nil, nil, nil, "none"},
		{"asphalt + width 0.8m is none", sp("asphalt"), nil, fp(0.8), nil, nil, "none"},
		{"asphalt + width 1.2m downgrades to partial", sp("asphalt"), nil, fp(1.2), nil, nil, "partial"},
		{"asphalt + width 1.8m stays full", sp("asphalt"), nil, fp(1.8), nil, nil, "full"},
		{"asphalt + incline 7% downgrades to partial", sp("asphalt"), nil, nil, fp(7), nil, "partial"},
		{"asphalt + incline -7% (abs) downgrades to partial", sp("asphalt"), nil, nil, fp(-7), nil, "partial"},
		{"asphalt + incline 10% is none", sp("asphalt"), nil, nil, fp(10), nil, "none"},
		{"smoothness=intermediate alone is partial", nil, sp("intermediate"), nil, nil, nil, "partial"},
		{"smoothness=excellent alone is full", nil, sp("excellent"), nil, nil, nil, "full"},
		{"no signal is unknown", nil, nil, nil, nil, nil, "unknown"},
		{"wheelchair=no (step_free false) is none", nil, nil, nil, nil, bp(false), "none"},
		{"wheelchair=yes (step_free true) alone is full", nil, nil, nil, nil, bp(true), "full"},
		{"wheelchair=yes but sett surface caps at partial", sp("sett"), nil, nil, nil, bp(true), "partial"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var got string
			err := database.Pool.QueryRow(ctx,
				`select segment_rating($1, $2, $3, $4, $5)`,
				c.surface, c.smoothness, c.width, c.incline, c.stepFree,
			).Scan(&got)
			if err != nil {
				t.Fatalf("segment_rating: %v", err)
			}
			if got != c.want {
				t.Fatalf("rating = %q, want %q", got, c.want)
			}
		})
	}
}

// TestSegmentRatingGateSync guards the import gate against the SQL rating: every
// surface the importer will store must rate non-unknown, otherwise a value could
// pass the gate yet render as junk 'Невідомо'. Read-only.
func TestSegmentRatingGateSync(t *testing.T) {
	database := ratingTestDB(t)
	defer database.Close()
	ctx := context.Background()

	for _, surface := range allRecognizedSurfaces() {
		var got string
		if err := database.Pool.QueryRow(ctx,
			`select segment_rating($1, null, null, null, null)`, surface,
		).Scan(&got); err != nil {
			t.Fatalf("segment_rating(%q): %v", surface, err)
		}
		if got == "unknown" {
			t.Errorf("recognized surface %q rates 'unknown' — gate and rating are out of sync", surface)
		}
	}
}

func ratingTestDB(t *testing.T) *db.DB {
	t.Helper()
	_ = godotenv.Load("../../../../.env")
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping segment_rating integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	database, err := db.New(ctx, dsn)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	return database
}
