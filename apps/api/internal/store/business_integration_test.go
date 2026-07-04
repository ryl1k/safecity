package store

import (
	"context"
	"testing"
	"time"

	"github.com/safecity/api/internal/db"
)

// TestBusinessAccountIntegration exercises the account-level B2B write path:
// subscribe → the account is business, with plan + a future renewal. Cleans up
// the business_accounts row so the shared test user isn't left a business.
func TestBusinessAccountIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	database := dialTestDB(t, ctx)
	st := New(database)
	uid := firstUserID(t, ctx, database)
	defer func() { _, _ = database.Pool.Exec(ctx, "delete from business_accounts where user_id = $1", uid) }()

	// Not a business before subscribing.
	before, err := st.GetBusinessMe(ctx, uid)
	if err != nil {
		t.Fatalf("GetBusinessMe (before): %v", err)
	}
	if before.IsBusiness {
		t.Fatal("user should not be a business before subscribing (stale business_accounts row?)")
	}

	if err := st.SubscribeBusiness(ctx, uid, "monthly"); err != nil {
		t.Fatalf("SubscribeBusiness: %v", err)
	}

	after, err := st.GetBusinessMe(ctx, uid)
	if err != nil {
		t.Fatalf("GetBusinessMe (after): %v", err)
	}
	if !after.IsBusiness {
		t.Fatal("user should be a business after subscribing")
	}
	if after.Plan == nil || *after.Plan != "monthly" {
		t.Fatalf("plan = %v, want monthly", after.Plan)
	}
	if after.RenewsAt == nil || !after.RenewsAt.After(time.Now()) {
		t.Fatalf("renews_at = %v, want a future time", after.RenewsAt)
	}
}

// TestSearchPointsBusinessBoostIntegration locks in the search-priority boost now
// that "business" is account-level: a point owned by a business user must sort
// before a point owned by a non-business user, even when name order alone would
// reverse them. Uses direct inserts (privileged pool) for controlled ownership so
// the per-user point cap doesn't interfere.
func TestSearchPointsBusinessBoostIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	database := dialTestDB(t, ctx)
	st := New(database)

	uids := twoUserIDs(t, ctx, database)
	bizUID, plainUID := uids[0], uids[1]
	const marker = "itestboost"

	defer func() { _, _ = database.Pool.Exec(ctx, "delete from business_accounts where user_id = $1", bizUID) }()
	if err := st.SubscribeBusiness(ctx, bizUID, "monthly"); err != nil {
		t.Fatalf("SubscribeBusiness: %v", err)
	}

	bizID := insertOwnedPoint(t, ctx, database, marker+" zzz business", 24.0420, 49.8520, bizUID)
	plainID := insertOwnedPoint(t, ctx, database, marker+" aaa crowdsourced", 24.0421, 49.8521, plainUID)
	defer func() { _, _ = database.Pool.Exec(ctx, "delete from points where id = any($1)", []string{bizID, plainID}) }()

	hits, err := st.SearchPoints(ctx, marker, 10)
	if err != nil {
		t.Fatalf("SearchPoints: %v", err)
	}
	if len(hits) != 2 {
		t.Fatalf("expected 2 hits, got %d: %+v", len(hits), hits)
	}
	// Name order alone (aaa < zzz) would put the crowdsourced point first; the
	// business owner must override that.
	if hits[0].ID != bizID {
		t.Fatalf("expected business-owned point (%s) first, got %+v", bizID, hits)
	}
	if hits[1].ID != plainID {
		t.Fatalf("expected non-business point (%s) second, got %+v", plainID, hits)
	}
}

func twoUserIDs(t *testing.T, ctx context.Context, database *db.DB) []string {
	t.Helper()
	rows, err := database.Pool.Query(ctx, "select id::text from auth.users order by created_at limit 2")
	if err != nil {
		t.Fatalf("query users: %v", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatalf("scan user: %v", err)
		}
		ids = append(ids, id)
	}
	if len(ids) < 2 {
		t.Skip("need at least two auth.users for the boost test")
	}
	return ids
}

func insertOwnedPoint(t *testing.T, ctx context.Context, database *db.DB, name string, lng, lat float64, owner string) string {
	t.Helper()
	var id string
	if err := database.Pool.QueryRow(ctx, `
		insert into points (name, category, geom, source, verify_status, created_by)
		values ($1, 'venue', ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 'crowdsourced', 'unverified', $4)
		returning id::text`, name, lng, lat, owner).Scan(&id); err != nil {
		t.Fatalf("insert owned point: %v", err)
	}
	return id
}
