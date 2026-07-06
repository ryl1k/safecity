-- B2B analytics: track how often a point appears in search results, alongside the
-- existing view_count. Review counts/ratings are aggregated on read from reviews.
alter table points add column if not exists search_appearances integer not null default 0;
