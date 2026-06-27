-- Make external refs unique so importers can upsert idempotently (KB 09, two-way OSM later).
create unique index if not exists points_osm_id_uniq on points (osm_id) where osm_id is not null;
