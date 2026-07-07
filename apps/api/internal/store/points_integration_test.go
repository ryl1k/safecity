package store

import (
	"context"
	"testing"
	"time"
)

// TestPointReadsIntegration exercises the read RPCs against the real DB: near,
// bbox, and detail. Tolerant of an empty dataset, but verifies the round-trip
// scans cleanly and detail/near agree when data exists.
func TestPointReadsIntegration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	database := dialTestDB(t, ctx)
	st := New(database)

	// Lviv center.
	const lng, lat = 24.0316, 49.8419

	near, err := st.PointsNear(ctx, lng, lat, 5000)
	if err != nil {
		t.Fatalf("PointsNear: %v", err)
	}
	for _, p := range near {
		if p.DistanceM == nil {
			t.Fatalf("near point %s missing distance", p.ID)
		}
		if p.Features == nil {
			t.Fatalf("near point %s features is nil (should be {})", p.ID)
		}
	}
	t.Logf("PointsNear returned %d points", len(near))

	bbox, err := st.PointsInBBox(ctx, 23.9, 49.75, 24.15, 49.92)
	if err != nil {
		t.Fatalf("PointsInBBox: %v", err)
	}
	t.Logf("PointsInBBox returned %d points", len(bbox))

	// Detail of a real point if any exist; also assert a random uuid is not found.
	if len(near) > 0 {
		id := near[0].ID
		d, err := st.PointDetail(ctx, id)
		if err != nil {
			t.Fatalf("PointDetail(%s): %v", id, err)
		}
		if d == nil {
			t.Fatalf("PointDetail(%s) returned nil for an existing point", id)
		}
		if d.ID != id {
			t.Fatalf("PointDetail id = %s, want %s", d.ID, id)
		}
		if d.Photos == nil {
			t.Fatal("PointDetail photos is nil (should be [])")
		}
	}

	missing, err := st.PointDetail(ctx, "00000000-0000-0000-0000-000000000000")
	if err != nil {
		t.Fatalf("PointDetail(missing): %v", err)
	}
	if missing != nil {
		t.Fatal("expected nil for a non-existent point id")
	}
}
