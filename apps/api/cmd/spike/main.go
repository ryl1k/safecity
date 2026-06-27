// Spike (throwaway): verifies the riskiest backend assumptions against the real
// Supabase DB before we build the service:
//   1. pgx connects through the Supabase pooler.
//   2. RLS-via-claims works: SET LOCAL role authenticated + request.jwt.claims
//      makes auth.uid() resolve and existing RLS policies apply.
//   3. Which JWT scheme Supabase issues (asymmetric/JWKS vs legacy HS256).
// Everything DB-mutating runs in a transaction that is rolled back.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load("../../.env", ".env")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	dburl := os.Getenv("DATABASE_URL")
	if dburl == "" {
		fail("DATABASE_URL not set")
	}

	conn, err := pgx.Connect(ctx, dburl)
	if err != nil {
		fail("connect: %v", err)
	}
	defer func() { _ = conn.Close(ctx) }()

	var ver, role, postgis string
	must(conn.QueryRow(ctx, "select version()").Scan(&ver))
	must(conn.QueryRow(ctx, "select current_user").Scan(&role))
	_ = conn.QueryRow(ctx, "select extversion from pg_extension where extname='postgis'").Scan(&postgis)
	fmt.Printf("✓ connected · role=%s · postgis=%s · %s\n", role, postgis, short(ver))

	var uid string
	if err := conn.QueryRow(ctx, "select id::text from auth.users order by created_at limit 1").Scan(&uid); err != nil {
		fail("need a seeded user in auth.users: %v", err)
	}
	fmt.Printf("✓ test user uid = %s\n", uid)

	// --- RLS-via-claims, all inside a rolled-back tx ---
	tx, err := conn.Begin(ctx)
	if err != nil {
		fail("begin: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "set local role authenticated"); err != nil {
		fail("SET LOCAL role authenticated failed (%v) — pooler role can't drop to authenticated; RLS-via-claims won't work this way", err)
	}
	claims := fmt.Sprintf(`{"sub":"%s","role":"authenticated"}`, uid)
	if _, err := tx.Exec(ctx, "select set_config('request.jwt.claims', $1, true)", claims); err != nil {
		fail("set request.jwt.claims: %v", err)
	}
	var who string
	must(tx.QueryRow(ctx, "select coalesce(auth.uid()::text,'<null>')").Scan(&who))
	if who != uid {
		fail("auth.uid()=%s, expected %s", who, uid)
	}
	fmt.Printf("✓ auth.uid() resolves from claims under role=authenticated\n")

	const ins = "insert into points(name,category,geom,created_by) values('__spike__','venue',ST_SetSRID(ST_MakePoint(24.03,49.84),4326)::geography,%s)"
	if _, err := tx.Exec(ctx, fmt.Sprintf(ins, "auth.uid()")); err != nil {
		fail("RLS should ALLOW own insert: %v", err)
	}
	fmt.Printf("✓ RLS ALLOWS insert with created_by = auth.uid()\n")
	if _, err := tx.Exec(ctx, fmt.Sprintf(ins, "null")); err == nil {
		fail("RLS should DENY insert with created_by=null — but it succeeded (policies NOT applied!)")
	} else {
		fmt.Printf("✓ RLS DENIES insert when created_by != auth.uid() (%s)\n", short(err.Error()))
	}
	_ = tx.Rollback(ctx)

	// --- JWT scheme ---
	kind := "legacy HS256 shared secret (use SUPABASE JWT secret to verify)"
	jwksURL := strings.TrimRight(os.Getenv("SUPABASE_URL"), "/") + "/auth/v1/.well-known/jwks.json"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, jwksURL, nil)
	req.Header.Set("apikey", os.Getenv("SUPABASE_PUBLISHABLE_KEY"))
	if resp, err := http.DefaultClient.Do(req); err == nil {
		defer func() { _ = resp.Body.Close() }()
		var body struct {
			Keys []json.RawMessage `json:"keys"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&body)
		if resp.StatusCode == 200 && len(body.Keys) > 0 {
			kind = fmt.Sprintf("asymmetric / JWKS — %d key(s) at %s", len(body.Keys), jwksURL)
		}
	}
	fmt.Printf("✓ Supabase JWT scheme: %s\n", kind)

	fmt.Println("\nSPIKE PASS — RLS-via-claims works through the pooler; auth strategy known.")
}

func short(s string) string {
	s = strings.TrimSpace(strings.ReplaceAll(s, "\n", " "))
	if len(s) > 90 {
		return s[:90] + "…"
	}
	return s
}
func must(err error) {
	if err != nil {
		fail("%v", err)
	}
}
func fail(f string, a ...any) {
	fmt.Printf("✗ "+f+"\n", a...)
	os.Exit(1)
}
