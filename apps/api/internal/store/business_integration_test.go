package store

import (
	"context"
	"errors"
	"testing"
	"time"
)

// TestBusinessListingWritesIntegration exercises the business-listing write path
// against the real DB end-to-end: create business point (+ its business_listings
// row) → list via MyBusinessPoints → mark verified (mock payment) → subscribe
// (mock). Cleans up via the pool (business_listings cascades on point delete).
func TestBusinessListingWritesIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	database := dialTestDB(t, ctx)
	st := New(database)
	uid := firstUserID(t, ctx, database)

	const missingID = "00000000-0000-0000-0000-000000000000"
	const otherUID = "00000000-0000-0000-0000-000000000001"

	// ── Create business point ────────────────────────────────────────────────
	pid, err := st.CreateBusinessPoint(ctx, uid, NewPoint{
		Name:     "itest business point",
		Category: "venue",
		Lng:      24.0410,
		Lat:      49.8510,
		Features: map[string]string{},
		Photos:   []string{},
	})
	if err != nil {
		t.Fatalf("CreateBusinessPoint: %v", err)
	}
	defer func() { _, _ = database.Pool.Exec(ctx, "delete from points where id = $1", pid) }()

	rows, err := st.MyBusinessPoints(ctx, uid)
	if err != nil {
		t.Fatalf("MyBusinessPoints: %v", err)
	}
	found := findBusinessRow(rows, pid)
	if found == nil {
		t.Fatalf("MyBusinessPoints did not include the new point %s", pid)
	}
	if found.VerifiedPaid {
		t.Fatal("new business point should not be verified-paid yet")
	}
	if found.SubscriptionStatus != "none" {
		t.Fatalf("subscription status = %q, want none", found.SubscriptionStatus)
	}

	// ── Ownership + not-found guards ─────────────────────────────────────────
	if err := st.MarkVerifiedPaid(ctx, otherUID, pid); !errors.Is(err, ErrNotFound) {
		t.Fatalf("MarkVerifiedPaid by non-owner: want ErrNotFound, got %v", err)
	}
	if err := st.MarkVerifiedPaid(ctx, uid, missingID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("MarkVerifiedPaid missing point: want ErrNotFound, got %v", err)
	}

	// ── Mock payment: verify, then subscribe ─────────────────────────────────
	if err := st.MarkVerifiedPaid(ctx, uid, pid); err != nil {
		t.Fatalf("MarkVerifiedPaid: %v", err)
	}
	if err := st.SetSubscription(ctx, uid, pid, "monthly"); err != nil {
		t.Fatalf("SetSubscription: %v", err)
	}

	rows, err = st.MyBusinessPoints(ctx, uid)
	if err != nil {
		t.Fatalf("MyBusinessPoints (after): %v", err)
	}
	found = findBusinessRow(rows, pid)
	if found == nil {
		t.Fatal("business point disappeared after updates")
	}
	if !found.VerifiedPaid || found.VerifiedPaidAt == nil {
		t.Fatalf("verified paid state = %+v", found)
	}
	if found.SubscriptionStatus != "active" || found.SubscriptionPlan == nil || *found.SubscriptionPlan != "monthly" {
		t.Fatalf("subscription state = %+v", found)
	}
	if found.SubscriptionRenewsAt == nil {
		t.Fatal("subscription renews_at not set")
	}
}

func findBusinessRow(rows []BusinessPointRow, pointID string) *BusinessPointRow {
	for i := range rows {
		if rows[i].PointID == pointID {
			return &rows[i]
		}
	}
	return nil
}

// TestSearchPointsBusinessBoostIntegration locks in the search-priority boost:
// an active-subscriber business point must sort before a plain crowdsourced
// point even when name order alone would put it later (regression test for the
// NULLS FIRST trap in `order by (bl.subscription_status = 'active') desc` —
// without the coalesce, a non-business row's NULL sorts before TRUE on DESC).
func TestSearchPointsBusinessBoostIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	database := dialTestDB(t, ctx)
	st := New(database)
	uid := firstUserID(t, ctx, database)

	const marker = "itestboost"

	bizID, err := st.CreateBusinessPoint(ctx, uid, NewPoint{
		Name:     marker + " zzz business",
		Category: "venue",
		Lng:      24.0420,
		Lat:      49.8520,
		Features: map[string]string{},
		Photos:   []string{},
	})
	if err != nil {
		t.Fatalf("CreateBusinessPoint: %v", err)
	}
	defer func() { _, _ = database.Pool.Exec(ctx, "delete from points where id = $1", bizID) }()
	if err := st.SetSubscription(ctx, uid, bizID, "monthly"); err != nil {
		t.Fatalf("SetSubscription: %v", err)
	}

	plainID, err := st.AddPoint(ctx, uid, NewPoint{
		Name:     marker + " aaa crowdsourced",
		Category: "venue",
		Lng:      24.0421,
		Lat:      49.8521,
		Features: map[string]string{},
		Photos:   []string{},
	})
	if err != nil {
		t.Fatalf("AddPoint: %v", err)
	}
	defer func() { _, _ = database.Pool.Exec(ctx, "delete from points where id = $1", plainID) }()

	hits, err := st.SearchPoints(ctx, marker, 10)
	if err != nil {
		t.Fatalf("SearchPoints: %v", err)
	}
	if len(hits) != 2 {
		t.Fatalf("expected 2 hits, got %d: %+v", len(hits), hits)
	}
	// Name order alone (aaa < zzz) would put the crowdsourced point first; the
	// active subscription must override that.
	if hits[0].ID != bizID {
		t.Fatalf("expected active-subscriber business point (%s) first, got %+v", bizID, hits)
	}
	if hits[1].ID != plainID {
		t.Fatalf("expected crowdsourced point (%s) second, got %+v", plainID, hits)
	}
}
