-- Make osm_way_id unique so the sidewalk importer can upsert idempotently (mirrors 0014 for points).
create unique index if not exists street_segments_osm_way_id_uniq on street_segments (osm_way_id) where osm_way_id is not null;
