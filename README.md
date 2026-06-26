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
  api/             Node REST API (thin, over Supabase) + ORS proxy + imports
  ml/              gRPC CV/AI microservices (server-side only)
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

## Getting started (once scaffolded)

```bash
pnpm install
cp .env.example .env   # fill in Supabase + ORS keys
pnpm dev               # turbo runs all apps
```

## Key decisions
See KB notes: `03 Onboarding (spine)`, `04 Points`, `05 Routing`, `06 CV+TTS`,
`07 Civic Loop`, `10 Architecture`, `11 A11y Standards`, `13 Repo Structure`.

Accessibility is the product — **WCAG 2.2 AA is the minimum bar on every screen.**
