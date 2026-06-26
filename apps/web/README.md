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

KB: `02 · Map`, `08 · Accounts` (admin surface), `11 · A11y`.
