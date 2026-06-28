# @safecity/web

Next.js (App Router) — responsive public app **and** the admin console in one app.

```
app/
  (public)/   map, search, point/[id], civic, route, auth
  (admin)/    /admin — role-guarded moderation console
src/          components, features, lib (supabase, api-client, i18n), theme (tailwind + tokens)
```

MapLibre GL JS for the map. WCAG 2.2 AA + keyboard nav + axe-core in CI.
Could split into a separate `apps/admin` later if it grows.

## Go API integration (hybrid)
`src/lib/api.ts` is a thin client for the Go API. Data paths use it when
`NEXT_PUBLIC_API_URL` is set and **fall back to Supabase-direct otherwise**, so the
app keeps working before the API is deployed. Migrated so far: point reads
(near/bbox/detail), geocoding, routing, and the contribution/civic writes
(add point, review, report problem, confirm, create/sign petition). Auth, Storage
uploads, and Realtime stay on Supabase. Writes attach the Supabase access token as
a Bearer header. To use the local API in dev, set `NEXT_PUBLIC_API_URL=http://localhost:8080`
in `apps/web/.env.local` and run the API (`apps/api`).

KB: `02 · Map`, `08 · Accounts` (admin surface), `11 · A11y`.
