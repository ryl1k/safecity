// Package importer holds the data-seeding ETL ported from tooling/importers:
// OSM Overpass, Google MyMaps KML, and a proximity+name dedupe. Jobs are
// idempotent (upsert keyed on osm_id) and run with the privileged pool
// connection (imports bypass RLS, as the original Node scripts did).
package importer

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// userAgent identifies this service to Overpass (matches the identity already
// used for Nominatim in internal/geo). Public OSM-adjacent APIs commonly
// reject requests carrying the default Go HTTP client user agent.
const userAgent = "SafeCity/1.0 (+https://safecity.lviv)"

// PointRecord is one point to upsert.
type PointRecord struct {
	Name         string
	Category     string
	Lng, Lat     float64
	Address      *string
	Description  *string
	VerifyStatus string // verified | unverified | official
	OSMID        string // external key for idempotency (osm type/id, or mymaps/lng,lat)
}

// Stats summarizes an import run.
type Stats struct {
	Upserts  int
	Features int
	Skipped  int
}

const upsertPointSQL = `
insert into points (name, category, geom, address, description, source, verify_status, osm_id)
values ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, $6, 'imported', $7, $8)
on conflict (osm_id) where osm_id is not null
do update set name = excluded.name, geom = excluded.geom,
              address = coalesce(excluded.address, points.address),
              description = coalesce(excluded.description, points.description),
              updated_at = now()
returning id::text`

// upsertPoint inserts/updates a point keyed on osm_id and returns its id.
func upsertPoint(ctx context.Context, pool *pgxpool.Pool, p PointRecord) (string, error) {
	var id string
	err := pool.QueryRow(ctx, upsertPointSQL,
		p.Name, p.Category, p.Lng, p.Lat, p.Address, p.Description, p.VerifyStatus, p.OSMID,
	).Scan(&id)
	return id, err
}

const upsertFeatureSQL = `
insert into point_feature_values (point_id, feature_key, value)
values ($1, $2, $3::feature_value)
on conflict (point_id, feature_key) do update set value = excluded.value`

func upsertFeature(ctx context.Context, pool *pgxpool.Pool, pointID, key, value string) error {
	_, err := pool.Exec(ctx, upsertFeatureSQL, pointID, key, value)
	return err
}

func strptr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
