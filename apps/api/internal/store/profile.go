package store

import (
	"context"

	"github.com/jackc/pgx/v5"
)

const updateProfileNeedsSQL = `
update profiles
set needs = $1::profile_type[], primary_need = $2::profile_type, updated_at = now()
where id = auth.uid()`

// UpdateProfileNeeds stores the caller's accessibility profile (device →
// account sync after sign-in). RLS restricts the update to the caller's row.
func (s *Store) UpdateProfileNeeds(ctx context.Context, userID string, needs []string, primary string) error {
	if needs == nil {
		needs = []string{}
	}
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, updateProfileNeedsSQL, needs, nullable(primary))
		return err
	})
	return classify(err)
}
