package store

import (
	"context"
)

const reviewsForSQL = `
select id::text, point_id::text, profile::text, stars, text, photos, created_at
from reviews
where point_id = $1::uuid
order by created_at desc`

// ReviewsFor returns all reviews of a point, newest first. Public read.
func (s *Store) ReviewsFor(ctx context.Context, pointID string) ([]Review, error) {
	rows, err := s.db.Pool.Query(ctx, reviewsForSQL, pointID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Review{}
	for rows.Next() {
		var rv Review
		if err := rows.Scan(&rv.ID, &rv.PointID, &rv.Profile, &rv.Stars, &rv.Text, &rv.Photos, &rv.CreatedAt); err != nil {
			return nil, err
		}
		if rv.Photos == nil {
			rv.Photos = []string{}
		}
		out = append(out, rv)
	}
	return out, rows.Err()
}

// ReviewStat is the aggregate rating of one point.
type ReviewStat struct {
	PointID string  `json:"point_id"`
	Avg     float64 `json:"avg"`
	Count   int     `json:"count"`
}

const reviewStatsSQL = `
select point_id::text, avg(stars)::float8, count(*)::int
from reviews
group by point_id`

// ReviewStats aggregates average stars + review count per point (SQL-side, so
// clients never fetch the whole reviews table).
func (s *Store) ReviewStats(ctx context.Context) ([]ReviewStat, error) {
	rows, err := s.db.Pool.Query(ctx, reviewStatsSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ReviewStat{}
	for rows.Next() {
		var st ReviewStat
		if err := rows.Scan(&st.PointID, &st.Avg, &st.Count); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}
