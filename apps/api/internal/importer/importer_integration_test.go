package importer

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/joho/godotenv"

	"github.com/safecity/api/internal/db"
)

// TestImportKMLIdempotentIntegration imports the same KML twice against the real
// DB and asserts the upsert is idempotent (one row per osm_id, not two). Cleans
// up the synthetic points. Skipped when DATABASE_URL is unset.
func TestImportKMLIdempotentIntegration(t *testing.T) {
	_ = godotenv.Load("../../../../.env")
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping importer integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	database, err := db.New(ctx, dsn)
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	defer database.Close()

	// Synthetic coords unlikely to collide with real data; deterministic osm_id.
	const kml = `<kml><Placemark><name>itest kml point</name>
		<Point><coordinates>24.99999,49.99999,0</coordinates></Point></Placemark></kml>`
	const osmID = "mymaps/24.99999,49.99999"
	defer func() { _, _ = database.Pool.Exec(ctx, "delete from points where osm_id = $1", osmID) }()

	for i := 0; i < 2; i++ {
		st, err := ImportKML(ctx, database.Pool, kml, "venue")
		if err != nil {
			t.Fatalf("ImportKML run %d: %v", i+1, err)
		}
		if st.Upserts != 1 {
			t.Fatalf("run %d upserts = %d, want 1", i+1, st.Upserts)
		}
	}

	var count int
	if err := database.Pool.QueryRow(ctx,
		"select count(*) from points where osm_id = $1", osmID).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Fatalf("rows for %s = %d, want 1 (upsert not idempotent)", osmID, count)
	}
}
