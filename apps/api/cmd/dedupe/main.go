// Command dedupe merges proximity+name duplicate points (KB 09). Dry-run by
// default; pass --apply to perform the merges. Idempotent and re-runnable.
//
//	go run ./cmd/dedupe              # dry run
//	go run ./cmd/dedupe --apply
//
// Tune with DEDUPE_RADIUS_M (default 30) and DEDUPE_NAME_SIM (default 0.6).
package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"

	"github.com/safecity/api/internal/db"
	"github.com/safecity/api/internal/importer"
)

func main() {
	apply := false
	for _, a := range os.Args[1:] {
		if a == "--apply" {
			apply = true
		}
	}

	_ = godotenv.Load("../../.env", ".env")
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL not set")
		os.Exit(1)
	}
	radius := envFloat("DEDUPE_RADIUS_M", importer.DefaultRadiusM)
	nameSim := envFloat("DEDUPE_NAME_SIM", importer.DefaultNameSim)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	database, err := db.New(ctx, dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "db: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	report, err := importer.Dedupe(ctx, database.Pool, radius, nameSim, apply)
	if err != nil {
		fmt.Fprintf(os.Stderr, "dedupe failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Scanned %d points (radius %.0f m, name-sim ≥ %.2f).\n", report.Scanned, radius, nameSim)
	for _, m := range report.Merges {
		names := make([]string, len(m.Dups))
		for i, d := range m.Dups {
			names[i] = "«" + d.Name + "»"
		}
		fmt.Printf("MERGE «%s» ← %s\n", m.Survivor.Name, strings.Join(names, ", "))
	}
	if apply {
		fmt.Printf("Dedupe applied: merged %d duplicate(s).\n", report.MergedCount())
	} else {
		fmt.Printf("Dry run: %d duplicate(s) would be merged. Re-run with --apply.\n", report.MergedCount())
	}
}

func envFloat(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return def
}
