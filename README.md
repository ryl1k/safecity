# SafeCity

Inclusive accessibility map for **Lviv, Ukraine** — mobile + web. One app that **adapts to
each user's needs** (wheelchair / blind) via onboarding, and turns accessibility barriers
into civic action (Problem → Petition).

> Full product knowledge base + task board live in the `board` MCP (Aptios), notes tagged
> `safecity` (00–13). This README is just the repo map.

## Monorepo (Turborepo + pnpm)

```
apps/
  mobile/          React Native (Expo + dev client) — iOS/Android
  web/             Next.js — public app + /admin moderation console
  api/             Go API (chi) in front of Supabase + ORS/Nominatim proxies + import CLIs
  ml/              Python gRPC CV/AI microservices (server-side only)
packages/
  shared/          types, zod schemas, accessibility rules engine, api-client
  design-tokens/   colors/type/space + themes (standard / high-contrast / dark)
  config/          shared eslint / tsconfig / prettier presets
supabase/          migrations, RLS policies, seed
tooling/
  importers/       MyMaps KML + OSM Overpass seed scripts
```

**Dependency rule:** `apps/*` → `packages/*`; `packages/*` never depend on apps;
`packages/shared` is platform-agnostic (no React, no Node-only APIs).

## Running the stack

Supabase (Postgres/PostGIS, Auth, Storage) is **managed** — it is not run locally.
Put its URL/keys (plus `ORS_API_KEY`) in `.env`; the web's public client config lives
in `apps/web/.env.local`.

### Option A — Docker (everything at once)

```bash
# web build args (NEXT_PUBLIC_*) come from apps/web/.env.local; server vars from .env
docker compose --env-file apps/web/.env.local up --build
```
Web → http://localhost:3000 · API → http://localhost:8080 · ML gRPC → localhost:50051.
(Or copy the two `NEXT_PUBLIC_SUPABASE_*` public values into root `.env` and just run
`docker compose up --build`.)

### Option B — local dev

```bash
pnpm install

# API (Go) — loads repo-root .env
cd apps/api && go run ./cmd/server          # :8080

# Web (Next.js) — reads apps/web/.env.local
pnpm --filter @safecity/web dev             # :3000
# To route the web through the Go API, set NEXT_PUBLIC_API_URL=http://localhost:8080
# in apps/web/.env.local (otherwise it talks to Supabase directly).

# ML (optional, Python gRPC)
cd apps/ml && pip install -e ".[dev]" && python -m safecity_ml   # :50051
```

The API also ships seed/import CLIs (`go run ./cmd/{import-osm,import-mymaps,dedupe}`)
and `go test ./...` (RLS + handler + testcontainers integration).

## Key decisions
See KB notes: `03 Onboarding (spine)`, `04 Points`, `05 Routing`, `06 CV+TTS`,
`07 Civic Loop`, `10 Architecture`, `11 A11y Standards`, `13 Repo Structure`.

Accessibility is the product — **WCAG 2.2 AA is the minimum bar on every screen.**
