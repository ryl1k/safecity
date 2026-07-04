// Command import-sidewalks seeds street_segments from OSM Overpass sidewalk
// geometry (footway=sidewalk / sidewalk=*). Idempotent on osm_way_id.
//
//	go run ./cmd/import-sidewalks                 # default central-Lviv bbox
//	LVIV_BBOX="S,W,N,E" go run ./cmd/import-sidewalks
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"

	"github.com/safecity/api/internal/db"
	"github.com/safecity/api/internal/importer"
)

func main() {
	_ = godotenv.Load("../../.env", ".env")
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL not set")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	database, err := db.New(ctx, dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	bbox := os.Getenv("LVIV_BBOX")
	endpoint := os.Getenv("OVERPASS_URL")
	fmt.Printf("Querying Overpass (bbox %s) …\n", orDefault(bbox, importer.DefaultBBox))

	st, err := importer.ImportSidewalks(ctx, database.Pool, &http.Client{Timeout: 100 * time.Second}, endpoint, bbox)
	if err != nil {
		fmt.Fprintf(os.Stderr, "sidewalk import failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Sidewalk import: %d segments upserted, %d skipped.\n", st.Upserts, st.Skipped)
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}
