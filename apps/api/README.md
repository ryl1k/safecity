# @safecity/api — Go API

Go service that sits in front of Supabase (Postgres + PostGIS, Auth, Storage). It owns
validated/heavy paths (contribution + civic writes, point reads, ingestion, routing/geocoding
proxies, ML orchestration). Clients keep **Auth, Storage uploads, and Realtime** on Supabase
directly. See board epic **M10 · Go API backend**.

## Layout
- `cmd/server` — entrypoint (HTTP server, graceful shutdown, structured logging)
- `cmd/spike` — throwaway DB/auth probe used to de-risk pgx + pooler + RLS-via-claims
- `internal/config` — typed env config
- `internal/server` — chi router, middleware, handlers

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
