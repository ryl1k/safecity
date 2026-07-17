# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install                                    # pnpm 9 via corepack; Node >= 20

# Workspace (turbo fans out to apps/* and packages/*)
pnpm type-check                                 # TS across the workspace
pnpm lint
pnpm test
pnpm --filter @safecity/web dev                 # web → :3000
pnpm --filter @safecity/web build

# Go API — loads the repo-root .env itself
cd apps/api && go run ./cmd/server              # → :8080
cd apps/api && go test -race ./...              # what CI runs
cd apps/api && go test ./internal/server -run TestHandleRoute        # single test
cd apps/api && go test ./internal/store -run TestCreateProblemIntegration

# Database (all read the repo-root .env)
pnpm db:migrate                                 # apply supabase/migrations/*.sql
pnpm db:seed
pnpm db:make-admin
pnpm db:import-osm / db:import-mymaps / db:import-bezbar / db:dedupe
```

Most `packages/*` and `apps/{ml,mobile}` test/lint scripts are still `echo` scaffolds, so a green `pnpm test` means much less than it looks. The real test suite is `go test ./...` in `apps/api`. `apps/web` has no ESLint config yet (CI lints it with `continue-on-error`).

CI (`.github/workflows/ci.yml`) is path-filtered per app via `changes.yml` — touching only `apps/api` runs only the Go job.

## Environment split

Server-side vars live in the repo-root `.env` (`DATABASE_URL`, `SUPABASE_SECRET_KEY`, `ORS_API_KEY`, `CORS_ORIGINS`); the web's public vars live in `apps/web/.env.local` (`NEXT_PUBLIC_*`, inlined into the browser build). The Go API reads root `.env` via godotenv; `turbo.json` declares it a global dependency. Env vars the API reads are all in `apps/api/internal/config/config.go`.

## Architecture

Clients (Next.js web, Expo mobile) → **Go API** (chi) → Supabase (Postgres + PostGIS + pgRouting). The API also proxies ORS/Nominatim/Transitous so keys stay server-side, and optionally talks to `apps/ml` over gRPC.

### RLS-via-claims — the central security invariant

`apps/api/internal/db/db.go` is the load-bearing file. Every data access goes through `db.WithUser(ctx, userID, fn)` or `db.WithAnon(ctx, fn)`, which open a transaction and run `set local role authenticated|anon` plus `set_config('request.jwt.claims', ...)` before calling `fn`. Postgres RLS policies then enforce authorization — `auth.uid()` resolves inside SQL.

This means: **never query `db.Pool` directly for user data.** Ownership is forced in SQL (e.g. `created_by = auth.uid()` in `insertProblemSQL`, `internal/store/civic.go`), not trusted from the client. Go-side role checks (`auth.RequireRole`) are a gate in front of RLS, not a replacement for it.

Two consequences of running against Supabase's **transaction-mode pooler** (port 6543), both already handled in `db.go` and easy to break:
- `DefaultQueryExecMode = pgx.QueryExecModeExec` — transaction pooling can't persist prepared statements; re-enabling caching yields `prepared statement already exists`.
- `MaxConns` is capped at 8 (`DB_MAX_CONNS`) below the pooler's client limit; exceeding it surfaces as flaky 500s (`max clients reached`).

### Go API layout

`cmd/` holds entrypoints (`server`, plus import CLIs `import-osm`, `import-mymaps`, `import-sidewalks`, `dedupe`). `internal/server/server.go` defines a `DataStore` interface (consumer-side, so handlers unit-test against `fake_test.go`) and a `Deps` struct whose fields are **individually nil-able** — nil `Store`/`Geo`/`Transit`/`Verifier` disables those routes rather than panicking, which is how tests construct a minimal server. Routes are all registered in `s.routes()`.

Auth is **guest-friendly by design** (`internal/auth/middleware.go`): no bearer token passes through anonymous so public reads stay open, but a *present-but-invalid* token is a 401 — callers can't downgrade to anon by sending junk.

### Two separate rating systems — do not conflate

- **Street segments** (sidewalks) are rated in **SQL**: `segment_rating(...)` returns `none|partial|full|unknown`. The canonical version is the **9-arg** overload in `supabase/migrations/0028_segment_rating_v4.sql` (surface, smoothness, width, incline, step-free, lit, curb-cuts, tactile, obstacle-free). The older **5-arg** overload from `0019` still exists for an existing test — call the 9-arg one.
- **Points** (places) are rated in **TypeScript**: `computeRating()` in `packages/shared/src/rules/index.ts`, a per-profile traffic light over the feature catalog with weighted criteria.

They cover different domains, so this is not duplication — but "change the rating logic" is ambiguous and means different files depending on which one is meant. Ask.

The honesty principle is encoded in both: the SQL takes the *worse of* surface and smoothness so cobblestone can't masquerade as asphalt, and missing data yields `unknown` rather than an invented level.

### Migration drift — the biggest footgun here

Migrations are applied by `scripts/migrate.mjs` in **lexical filename order**, tracked in a `_migrations` table, each in a transaction. Applied files are never re-run, so **migrations are immutable once applied — add a new file, never edit an old one.**

Historically, rating/routing changes were pushed to the live DB through one-off scripts in `scripts/` (`update-rating-v4.mjs`, `add-incline-to-router.mjs`, `fix-route-edge-split.mjs`, …) and *never captured as migrations*. A DB rebuilt from `supabase/migrations/` alone therefore drifted from production, which broke prod with `function segment_rating(text,text,numeric,numeric,boolean) does not exist`. Migration `0028` exists to repair exactly that, and its header documents the incident.

**So: schema changes belong in `supabase/migrations/`.** Treat `scripts/*.mjs` as historical patches and diagnostics, not the schema's source of truth. Note also that several numbers are duplicated (two each of `0017_`, `0021_`, `0022_`) — ordering is lexical over the full filename, so pick a fresh number and check what's already there.

### Wheelchair routing

OpenRouteService is the engine; the differentiating logic is ours, in `internal/server/proxy.go` + `internal/geo/geo.go`. Impassable segments are fetched per-bbox (`SegmentAvoidsInBBox`) and turned into buffered `avoid_polygons` for ORS. pgRouting alternatives that cross red segments are discarded in favor of ORS.

The "no accessible detour" honesty check is a distance-fraction test, not a crossing test: a route can run *alongside* a red segment (roadway vs sidewalk, ~10 m apart) without crossing it. `fractionOfLineNearRoute` densifies the segment every ~5 m and measures the fraction within `alongMeters` (15 m) of the route polyline; above threshold, the user gets warned. Tuning constants sit together at `proxy.go:206` (`corridorMeters` 110, `clearMeters` 25, `alongMeters` 15, `maxAvoidPolys` 100 — ORS fails with too many polygons).

## Conventions

- **Dependency rule:** `apps/*` → `packages/*`; packages never depend on apps. `packages/shared` is platform-agnostic (no React, no Node-only APIs) — convention, not lint-enforced, so it's on you.
- Go integration tests **skip silently** when `DATABASE_URL` is unset (that's why CI stays green without a DB). A passing `go test ./...` locally may not have run them; check for `skipping DB integration test`.
- Accessibility is the product: WCAG 2.2 AA is the floor on every screen (keyboard focus, SR labels, reduced motion, three themes from `packages/design-tokens`).
- Data sources require attribution: «Мапа безбар'єрності» (CC-BY), OpenStreetMap (ODbL).
- Commits follow Conventional Commits (release-please); `develop` is the working branch, `main` deploys (Vercel + Render).
