package store

import (
	"context"
)

// Feature is one entry of the accessibility feature catalog.
type Feature struct {
	Key        string   `json:"key"`
	Label      string   `json:"label"`
	Profile    string   `json:"profile"`
	Categories []string `json:"categories"`
	Critical   bool     `json:"critical"`
	ValueType  string   `json:"value_type"`
	Unit       *string  `json:"unit"`
}

const featureCatalogSQL = `
select key, label, profile::text, categories::text[], critical, value_type::text, unit
from accessibility_features
order by key`

// FeatureCatalog returns the accessibility feature catalog (small, public).
func (s *Store) FeatureCatalog(ctx context.Context) ([]Feature, error) {
	rows, err := s.db.Pool.Query(ctx, featureCatalogSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Feature{}
	for rows.Next() {
		var f Feature
		if err := rows.Scan(&f.Key, &f.Label, &f.Profile, &f.Categories, &f.Critical, &f.ValueType, &f.Unit); err != nil {
			return nil, err
		}
		if f.Categories == nil {
			f.Categories = []string{}
		}
		out = append(out, f)
	}
	return out, rows.Err()
}
