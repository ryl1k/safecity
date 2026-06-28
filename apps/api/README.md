# @safecity/api — Go API

Go service that sits in front of Supabase (Postgres + PostGIS, Auth, Storage). It owns
validated/heavy paths (contribution + civic writes, point reads, ingestion, routing/geocoding
proxies, ML orchestration). Clients keep **Auth, Storage uploads, and Realtime** on Supabase
directly. See board epic **M10 · Go API backend**.

## Layout
- `cmd/server` — entrypoint (HTTP server, graceful shutdown, structured logging)
- `cmd/spike` — throwaway DB/auth probe used to de-risk pgx + pooler + RLS-via-claims
- `internal/config` — typed env config
- `internal/db` — pgx pool + RLS-via-claims tx helpers (`WithUser`/`WithAnon`)
- `internal/auth` — Supabase JWT verification (JWKS) + auth/role middleware
- `internal/httpx` — consistent JSON responses, error envelope, request decode + validation
- `internal/ratelimit` — keyed token-bucket limiter + middleware
- `internal/server` — chi router, middleware, handlers

## Endpoints
- `GET /healthz` — liveness (always 200 while the process is up)
- `GET /readyz` — readiness; pings Postgres (503 if down)
- `GET /metrics` — Prometheus exposition (request counts/latency, in-flight, Go runtime)
- `GET /me` — authenticated; returns `{user_id, email, role}`
- `GET /points/near?lng=&lat=&radius=` — public; points within `radius` m (default 1500,
  max 50000), nearest first. Each carries `features` for the client rating engine.
- `GET /points/bbox?min_lng=&min_lat=&max_lng=&max_lat=` — public; points in a bounding box.
- `GET /points/{id}` — public; full point detail (adds `description`, `photos`). 404 if absent.

### Writes (authenticated, rate-limited; `created_by`/`user_id` forced to the caller)
- `POST /points` — add a point. Body: `name`, `category`, `lat`, `lng` (required), `address?`,
  `description?`, `features?` (key→`yes|no|unknown`), `photos?` (Storage URLs). → 201 `{id}`.
- `POST /points/{id}/reviews` — create/replace the caller's review for one profile (upsert on
  point+user+profile). Body: `profile` (`wheelchair|blind`), `stars` (1–5), `text?`, `photos?`.
- `POST /problems` — report a problem (see above).
- `POST /problems/{id}/confirm` — confirm a problem. 409 if already confirmed, 404 if missing.
  Returns `{confirmations, status}`.
- `POST /petitions` — create a petition. Body: `problem_id`, `title` (required), `scope?`
  (`internal` default | `official`), `body?`, `official_url?`. → 201 petition.
- `POST /petitions/{id}/sign` — sign a petition. 409 if already signed, 404 if missing.
  Returns `{signatures}` (live count).

Photo uploads stay client→Supabase Storage direct; the API only records the resulting URLs.
Note: petition signatures have no DB count trigger, so the API returns the live `count(*)`.

### Proxies (public, rate-limited; keys stay server-side)
- `POST /route` — OpenRouteService proxy. Body: `from` `[lng,lat]`, `to` `[lng,lat]` (required),
  `profile?` (`wheelchair` default | `blind`→foot), `params?` (`maxIncline`/`maxSlopedKerb`/`minWidth`).
  Wheelchair falls back to foot-walking when ORS finds no path. **avoid_polygons are built
  server-side** from confirmed/escalated problems in the route corridor (the client no longer
  needs to). Returns `{profile, fallback, avoided, coordinates, steps, summary}`. 503 if no ORS key.
- `GET /geocode?q=&limit=` — Nominatim proxy (cached 10 min, sends a required User-Agent).
  Returns `[{id, label, lng, lat}]`; empty for queries under 3 chars.

Base URLs are configurable (`ORS_BASE_URL`, `NOMINATIM_URL`) so ORS/Nominatim can be self-hosted.
- `POST /problems` — authenticated; report a problem. Body: `title` (required),
  `description?`, `category?`, `severity?` (1–3), and either `point_id` or `lat`+`lng`
  (dropped pin). Returns the created row (201). `created_by` is forced to the caller
  via RLS — the client cannot set it.

## Importers (ETL CLIs, idempotent on `osm_id`)
Run from `apps/api` (they load the repo-root `.env`). Admin jobs — they use the
privileged pool connection and bypass RLS, like the original Node scripts.
```
go run ./cmd/import-osm                 # OSM Overpass (LVIV_BBOX="S,W,N,E" to override)
go run ./cmd/import-mymaps <file.kml> [category]   # Google MyMaps KML
go run ./cmd/dedupe [--apply]           # merge proximity+name duplicates (dry-run default)
```
Logic lives in `internal/importer` (pure mapping/dedupe is unit-tested; KML upsert
idempotency is covered by a real-DB integration test).

## ML gRPC client
`internal/ml` is the Go client for the Python ML service (`apps/ml`), using stubs
generated from `packages/proto/ml.proto` into `internal/mlpb`. It exposes
`ModeratePhoto` / `DescribeScene` / `InferFeatures` plus `AnalyzePhoto`, which fans
moderation + feature inference out concurrently. Configure with `ML_GRPC_URL`
(the client connects lazily, so an absent ML service never blocks API startup).
Regenerate stubs via `packages/proto` (`buf generate`).

## Layers
A request flows: chi middleware (request id, logging, recover, timeout, optional auth)
→ handler (`internal/server`) → `httpx.Decode` validation → `internal/store` method →
`db.WithUser` RLS-claims tx → Postgres. `store` never trusts client-supplied ownership;
Postgres RLS policies enforce it.

## Observability
- **Structured logs:** slog (JSON in prod, text in dev). Every request logs method,
  path, route pattern, status, bytes, duration, and request id.
- **Request IDs:** chi `RequestID` (echoed in logs; surfaced for tracing later).
- **Panic recovery:** a custom recoverer logs the panic + stack (structured) and
  returns the standard JSON 500 envelope.
- **Metrics:** Prometheus at `/metrics` (`http_requests_total`,
  `http_request_duration_seconds`, `http_requests_in_flight` + Go/process collectors),
  labelled by the chi route pattern to bound cardinality.

## Conventions
- **Error shape:** every error is `{"error": {"code": "...", "message": "...", "fields": [...]}}`.
  `fields` appears only on 422 validation failures (`{field, message}` per invalid field).
- **Request bodies:** decoded via `httpx.Decode` — 1 MiB cap, unknown fields rejected,
  validated against `validate` struct tags (go-playground/validator).
- **Rate limiting:** throttled routes are keyed per user (or per IP for guests); over-limit
  returns 429 + `Retry-After`. Tunable via `RATE_LIMIT_RPS` / `RATE_LIMIT_BURST`.

## Run (dev)
```
cd apps/api
go run ./cmd/server        # loads repo-root .env if present; serves :8080
curl localhost:8080/healthz
```

## Test
```
go test ./...
```

## Docker
Multi-stage build (Go → `distroless/static:nonroot`). Build context is the repo root:
```
docker build -f apps/api/Dockerfile -t safecity-api .
docker run --rm -p 8080:8080 --env-file .env safecity-api
```
The image is static, non-root, and ships CA certs for outbound TLS. CD builds it
per `.github/workflows/cd.yml` (`context: .`, `file: apps/api/Dockerfile`).

## Notes
- **Auth:** Supabase issues asymmetric JWTs — verified via the JWKS endpoint (no shared secret).
- **DB authz:** keep Postgres RLS by running each request in a transaction that sets
  `role authenticated` + `request.jwt.claims` (validated by the spike).
- Connect via the Supabase **session pooler** (5432). If moving to the transaction pooler
  (6543), switch pgx to simple protocol / disable the statement cache.
