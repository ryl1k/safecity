package store

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/safecity/api/internal/db"
)

func firstUserID(t *testing.T, ctx context.Context, database *db.DB) string {
	t.Helper()
	var uid string
	if err := database.Pool.QueryRow(ctx,
		"select id::text from auth.users order by created_at limit 1").Scan(&uid); err != nil {
		t.Skipf("no seeded user in auth.users: %v", err)
	}
	return uid
}

// TestContribAndCivicWritesIntegration exercises every migrated write against the
// real DB end-to-end: add point → review (upsert twice) → problem → confirm
// (+dup/notfound) → petition → sign (+dup/notfound). Cleans up via the pool.
func TestContribAndCivicWritesIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	database := dialTestDB(t, ctx)
	st := New(database)
	uid := firstUserID(t, ctx, database)

	const missingID = "00000000-0000-0000-0000-000000000000"

	// ── Add point ──────────────────────────────────────────────────────────
	pid, err := st.AddPoint(ctx, uid, NewPoint{
		Name:     "itest point",
		Category: "venue",
		Lng:      24.0400,
		Lat:      49.8500,
		Address:  "itest addr",
		Features: map[string]string{},
		Photos:   []string{},
	})
	if err != nil {
		t.Fatalf("AddPoint: %v", err)
	}
	defer func() { _, _ = database.Pool.Exec(ctx, "delete from points where id = $1", pid) }()

	// ── Review upsert (create, then update same point+user+profile) ─────────
	rv, err := st.UpsertReview(ctx, uid, pid, NewReview{Profile: "wheelchair", Stars: 4, Text: "ok"})
	if err != nil {
		t.Fatalf("UpsertReview create: %v", err)
	}
	if rv.Stars != 4 {
		t.Fatalf("review stars = %d, want 4", rv.Stars)
	}
	rv2, err := st.UpsertReview(ctx, uid, pid, NewReview{Profile: "wheelchair", Stars: 2})
	if err != nil {
		t.Fatalf("UpsertReview update: %v", err)
	}
	if rv2.ID != rv.ID {
		t.Fatalf("upsert created a new row (%s != %s) instead of updating", rv2.ID, rv.ID)
	}
	if rv2.Stars != 2 {
		t.Fatalf("after upsert stars = %d, want 2", rv2.Stars)
	}

	// ── Create problem on the point ─────────────────────────────────────────
	prob, err := st.CreateProblem(ctx, uid, NewProblem{Title: "itest problem", PointID: pid, Severity: 1})
	if err != nil {
		t.Fatalf("CreateProblem: %v", err)
	}
	defer func() { _, _ = database.Pool.Exec(ctx, "delete from problems where id = $1", prob.ID) }()

	// ── Confirm ─────────────────────────────────────────────────────────────
	c1, err := st.ConfirmProblem(ctx, uid, prob.ID)
	if err != nil {
		t.Fatalf("ConfirmProblem: %v", err)
	}
	if c1.Confirmations != 1 {
		t.Fatalf("confirmations = %d, want 1 (trigger sync)", c1.Confirmations)
	}
	if _, err := st.ConfirmProblem(ctx, uid, prob.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate confirm: want ErrConflict, got %v", err)
	}
	if _, err := st.ConfirmProblem(ctx, uid, missingID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("confirm missing problem: want ErrNotFound, got %v", err)
	}

	// ── Create petition + sign ──────────────────────────────────────────────
	pet, err := st.CreatePetition(ctx, uid, NewPetition{ProblemID: prob.ID, Scope: "internal", Title: "itest petition"})
	if err != nil {
		t.Fatalf("CreatePetition: %v", err)
	}
	if pet.Scope != "internal" || pet.Status == "" {
		t.Fatalf("petition = %+v", pet)
	}
	s1, err := st.SignPetition(ctx, uid, pet.ID)
	if err != nil {
		t.Fatalf("SignPetition: %v", err)
	}
	if s1.Signatures != 1 {
		t.Fatalf("signatures = %d, want 1", s1.Signatures)
	}
	if _, err := st.SignPetition(ctx, uid, pet.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate sign: want ErrConflict, got %v", err)
	}
	if _, err := st.SignPetition(ctx, uid, missingID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("sign missing petition: want ErrNotFound, got %v", err)
	}

	// petition rows cascade-delete with the problem.
}
