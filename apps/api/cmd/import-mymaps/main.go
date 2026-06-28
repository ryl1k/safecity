// Command import-mymaps seeds points from an exported Google MyMaps KML (KB 09).
// KMZ? Unzip it first. Idempotent on a derived osm_id.
//
//	go run ./cmd/import-mymaps <file.kml> [category]
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"

	"github.com/safecity/api/internal/db"
	"github.com/safecity/api/internal/importer"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: import-mymaps <file.kml> [category]")
		os.Exit(1)
	}
	file := os.Args[1]
	category := "venue"
	if len(os.Args) >= 3 {
		category = os.Args[2]
	}
	if !importer.ValidCategory(category) {
		fmt.Fprintln(os.Stderr, "category must be one of: venue, transit, crossing, toilet, parking")
		os.Exit(1)
	}

	xml, err := os.ReadFile(file)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read %s: %v\n", file, err)
		os.Exit(1)
	}

	_ = godotenv.Load("../../.env", ".env")
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL not set")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	database, err := db.New(ctx, dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	st, err := importer.ImportKML(ctx, database.Pool, string(xml), category)
	if err != nil {
		fmt.Fprintf(os.Stderr, "mymaps import failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("MyMaps import: %d points upserted (category %s).\n", st.Upserts, category)
}
