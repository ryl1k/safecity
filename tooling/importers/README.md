# tooling/importers

Seed scripts so the Lviv map isn't empty on day one (run as jobs, idempotent).

- **MyMaps importer** — export the linked Lviv Google MyMaps (KML/KMZ), parse placemarks → Points.
- **OSM Overpass importer** — query Lviv bbox for accessibility tags
  (`wheelchair`, `tactile_paving`, `ramp`, `toilets:wheelchair`, `kerb`, `traffic_signals`),
  map to PointFeatureValue, keep OSM id ref (for future two-way), ODbL attribution.
- **Dedupe loader** — merge by proximity + name; idempotent re-runnable.

KB: `09 · Data Sources & Seeding`.

## Now ported to Go (canonical)

These importers have been reimplemented in the Go API and are the canonical
versions going forward (`apps/api/internal/importer`, CLIs in `apps/api/cmd`):

```
cd apps/api
go run ./cmd/import-osm                            # OSM Overpass
go run ./cmd/import-mymaps <file.kml> [category]   # MyMaps KML
go run ./cmd/dedupe [--apply]                      # dedupe (dry-run default)
```

The Go versions are faithful ports (same tag→feature mapping, same osm_id keys,
same dedupe scoring) with unit tests + a real-DB idempotency test. The `.mjs`
scripts here are retained as a legacy fallback; once the team confirms the Go
jobs in CI/cron, they (and the `db:import-*` npm scripts + the `postgres` dep)
can be removed.
