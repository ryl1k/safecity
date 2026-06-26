# @safecity/api

Thin Node REST API over Supabase. Holds custom logic only.

```
src/
  modules/   points, features, reviews, problems, petitions, profiles,
             routing (ORS proxy + avoid_polygons), import, moderation, ml-client (gRPC)
  plugins/   db (PostGIS), auth (verify Supabase JWT), validation (zod), errors
  server.ts  + OpenAPI spec generation
```

Supabase handles auth/storage/RLS. The API owns: ORS routing + live-barrier avoidance,
seed imports, moderation endpoints, and gRPC calls to `apps/ml`.

KB: `05 · Routing`, `09 · Data Seeding`, `10 · Tech & Architecture`.
