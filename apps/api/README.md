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
- `GET /me` — authenticated; returns `{user_id, email, role}`
- `POST /problems` — authenticated; report a problem. Body: `title` (required),
  `description?`, `category?`, `severity?` (1–3), and either `point_id` or `lat`+`lng`
  (dropped pin). Returns the created row (201). `created_by` is forced to the caller
  via RLS — the client cannot set it.

## Layers
A request flows: chi middleware (request id, logging, recover, timeout, optional auth)
→ handler (`internal/server`) → `httpx.Decode` validation → `internal/store` method →
`db.WithUser` RLS-claims tx → Postgres. `store` never trusts client-supplied ownership;
Postgres RLS policies enforce it.

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

## Notes
- **Auth:** Supabase issues asymmetric JWTs — verified via the JWKS endpoint (no shared secret).
- **DB authz:** keep Postgres RLS by running each request in a transaction that sets
  `role authenticated` + `request.jwt.claims` (validated by the spike).
- Connect via the Supabase **session pooler** (5432). If moving to the transaction pooler
  (6543), switch pgx to simple protocol / disable the statement cache.
