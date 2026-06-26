# tooling/importers

Seed scripts so the Lviv map isn't empty on day one (run as jobs, idempotent).

- **MyMaps importer** — export the linked Lviv Google MyMaps (KML/KMZ), parse placemarks → Points.
- **OSM Overpass importer** — query Lviv bbox for accessibility tags
  (`wheelchair`, `tactile_paving`, `ramp`, `toilets:wheelchair`, `kerb`, `traffic_signals`),
  map to PointFeatureValue, keep OSM id ref (for future two-way), ODbL attribution.
- **Dedupe loader** — merge by proximity + name; idempotent re-runnable.

KB: `09 · Data Sources & Seeding`.
