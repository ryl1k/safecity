// Command import-sidewalks seeds street_segments from OSM Overpass sidewalk
// geometry (footway=sidewalk / sidewalk=*). Idempotent on osm_way_id.
//
// By default it seeds the same 75 government-controlled cities used for the
// points showcase, capped at PER_CITY (default 35) segments each — matching
// the points density so streets and points look comparably populated.
//
//	go run ./cmd/import-sidewalks                     # national, 35/city
//	PER_CITY=50 go run ./cmd/import-sidewalks         # national, 50/city
//	SIDEWALK_BBOX="S,W,N,E" go run ./cmd/import-sidewalks   # single custom bbox, uncapped
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
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

	// 75 cities × (query + 1.5s courtesy delay) comfortably fits in 45 minutes;
	// a single custom-bbox run finishes in seconds regardless.
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Minute)
	defer cancel()

	database, err := db.New(ctx, dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	endpoint := os.Getenv("OVERPASS_URL")
	httpClient := &http.Client{Timeout: 120 * time.Second}

	if bbox := os.Getenv("SIDEWALK_BBOX"); bbox != "" {
		fmt.Printf("Querying Overpass (custom bbox %s) …\n", bbox)
		st, err := importer.ImportSidewalks(ctx, database.Pool, httpClient, endpoint, bbox)
		if err != nil {
			fmt.Fprintf(os.Stderr, "sidewalk import failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Sidewalk import: %d segments upserted, %d skipped.\n", st.Upserts, st.Skipped)
		return
	}

	perCity := importer.DefaultPerCity
	if v := os.Getenv("PER_CITY"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			perCity = n
		}
	}
	fmt.Printf("Seeding sidewalks nationwide: %d cities, up to %d segments each …\n", len(importer.Cities), perCity)

	st, err := importer.ImportSidewalksNational(ctx, database.Pool, httpClient, endpoint, perCity,
		func(city importer.City, st importer.Stats, cityErr error) {
			if cityErr != nil {
				fmt.Printf("  ✗ %-24s failed: %v\n", city.Name, cityErr)
				return
			}
			fmt.Printf("  ✓ %-24s %2d upserted, %2d skipped\n", city.Name, st.Upserts, st.Skipped)
		})
	if err != nil {
		fmt.Fprintf(os.Stderr, "national sidewalk import failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Done: %d segments upserted, %d skipped across %d cities.\n", st.Upserts, st.Skipped, len(importer.Cities))
}
