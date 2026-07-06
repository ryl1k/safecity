package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// MyPoint is one point the caller created, for their dashboard.
type MyPoint struct {
	ID                      string            `json:"id"`
	Name                    string            `json:"name"`
	Category                string            `json:"category"`
	Address                 *string           `json:"address"`
	VerifyStatus            string            `json:"verifyStatus"`
	VerificationRequestedAt *time.Time        `json:"verificationRequestedAt"`
	ViewCount               int               `json:"viewCount"`
	SearchAppearances       int               `json:"searchAppearances"`
	ReviewCount             int               `json:"reviewCount"`
	AvgRating               *float64          `json:"avgRating"`
	Features                map[string]string `json:"features"`
	CreatedAt               time.Time         `json:"createdAt"`
}

// BusinessMe is the caller's account state + the points they created.
type BusinessMe struct {
	IsBusiness bool       `json:"isBusiness"`
	Plan       *string    `json:"plan"`
	RenewsAt   *time.Time `json:"renewsAt"`
	Points     []MyPoint  `json:"points"`
}

const subscribeBusinessSQL = `
insert into business_accounts (user_id, active, plan, renews_at, updated_at)
values (auth.uid(), true, $1,
        now() + case when $1 = 'yearly' then interval '365 days' else interval '30 days' end, now())
on conflict (user_id) do update
  set active = true, plan = excluded.plan, renews_at = excluded.renews_at, updated_at = now()`

// SubscribeBusiness activates (or renews) the caller's account-level business
// subscription, unlocking unlimited points + verified/priority perks on all their
// points. MOCK: no payment processor — a real one must move this behind a webhook.
func (s *Store) SubscribeBusiness(ctx context.Context, userID, plan string) error {
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		_, e := tx.Exec(ctx, subscribeBusinessSQL, plan)
		return e
	})
	return classify(err)
}

const businessAccountSQL = `
select coalesce(active and (renews_at is null or renews_at > now()), false), plan, renews_at
from business_accounts where user_id = auth.uid()`

const myPointsSQL = `
select p.id::text, p.name, p.category::text, p.address, p.verify_status::text,
       p.verification_requested_at,
       p.view_count, p.search_appearances,
       coalesce(r.cnt, 0) as review_count, r.avg_stars,
       coalesce((select jsonb_object_agg(fv.feature_key, fv.value::text)
                 from point_feature_values fv where fv.point_id = p.id), '{}'::jsonb),
       p.created_at
from points p
left join (
  select point_id, count(*) as cnt, avg(stars)::float as avg_stars
  from reviews group by point_id
) r on r.point_id = p.id
where p.created_by = auth.uid()
order by p.created_at desc`

// GetBusinessMe returns the caller's business status and the points they created.
func (s *Store) GetBusinessMe(ctx context.Context, userID string) (BusinessMe, error) {
	var me BusinessMe
	me.Points = []MyPoint{}
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		// Account row (may not exist → defaults to non-business).
		if err := tx.QueryRow(ctx, businessAccountSQL).Scan(&me.IsBusiness, &me.Plan, &me.RenewsAt); err != nil {
			if err != pgx.ErrNoRows {
				return err
			}
		}
		rows, err := tx.Query(ctx, myPointsSQL)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var p MyPoint
			if err := rows.Scan(&p.ID, &p.Name, &p.Category, &p.Address, &p.VerifyStatus,
				&p.VerificationRequestedAt, &p.ViewCount, &p.SearchAppearances,
				&p.ReviewCount, &p.AvgRating, &p.Features, &p.CreatedAt); err != nil {
				return err
			}
			ensureFeatures(&p.Features)
			me.Points = append(me.Points, p)
		}
		return rows.Err()
	})
	return me, classify(err)
}

// BusinessReport is one problem a visitor reported on a point the caller owns.
// Reports on seeded points (points.created_by IS NULL) never surface here — those
// are handled by the moderator surface (GET /admin/problems).
type BusinessReport struct {
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	Description   *string   `json:"description"`
	Status        string    `json:"status"`
	Severity      int       `json:"severity"`
	Confirmations int       `json:"confirmations"`
	Photos        []string  `json:"photos"`
	PointID       string    `json:"pointId"`
	PointName     string    `json:"pointName"`
	CreatedAt     time.Time `json:"createdAt"`
}

const businessReportsSQL = `
select p.id::text, p.title, p.description, p.status::text, p.severity,
       p.confirmations, coalesce(p.photos, '{}'), pt.id::text, pt.name, p.created_at
from problems p
join points pt on pt.id = p.point_id
where pt.created_by = auth.uid()
order by (p.status = 'resolved'), p.severity desc, p.created_at desc
limit 500`

// GetBusinessReports returns the visitor-submitted problem reports on the points
// the caller created — an inbox of issues to fix, open first, then most severe.
func (s *Store) GetBusinessReports(ctx context.Context, userID string) ([]BusinessReport, error) {
	out := []BusinessReport{}
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		rows, e := tx.Query(ctx, businessReportsSQL)
		if e != nil {
			return e
		}
		defer rows.Close()
		for rows.Next() {
			var r BusinessReport
			if e := rows.Scan(&r.ID, &r.Title, &r.Description, &r.Status, &r.Severity,
				&r.Confirmations, &r.Photos, &r.PointID, &r.PointName, &r.CreatedAt); e != nil {
				return e
			}
			if r.Photos == nil {
				r.Photos = []string{}
			}
			out = append(out, r)
		}
		return rows.Err()
	})
	return out, classify(err)
}

// RequestPointVerification flags one of the caller's points for moderator review.
// PT404 (not owned) → ErrNotFound; already-verified points are a no-op.
func (s *Store) RequestPointVerification(ctx context.Context, userID, pointID string) error {
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		_, e := tx.Exec(ctx, `select request_point_verification($1::uuid)`, pointID)
		return e
	})
	return classify(err)
}

// ReviewPoint is one review's timestamp + rating, for the reviews-over-time graph.
// PointID lets the dashboard scope the graph to a single point (or aggregate all).
type ReviewPoint struct {
	PointID   string    `json:"pointId"`
	CreatedAt time.Time `json:"createdAt"`
	Stars     int       `json:"stars"`
}

// MetricDay is one point's running view/search totals on a given day (one row per
// point per day). The dashboard sums across points for the account-wide view, or
// filters to one point — hence per-point rows rather than a pre-summed total.
type MetricDay struct {
	Day               string `json:"day"` // YYYY-MM-DD
	PointID           string `json:"pointId"`
	ViewCount         int    `json:"viewCount"`
	SearchAppearances int    `json:"searchAppearances"`
}

// BusinessAnalytics is the time-series payload for the dashboard graphs. Reviews
// are real (from reviews.created_at); metrics accrue forward from the first
// snapshot (no history predates the metric-snapshots migration).
type BusinessAnalytics struct {
	Reviews []ReviewPoint `json:"reviews"`
	Metrics []MetricDay   `json:"metrics"`
}

const reviewsHistorySQL = `
select r.point_id::text, r.created_at, r.stars
from reviews r
join points p on p.id = r.point_id
where p.created_by = auth.uid()
  and r.created_at > now() - interval '365 days'
order by r.created_at
limit 5000`

const metricsHistorySQL = `
select s.day, s.point_id::text, s.view_count, s.search_appearances
from point_metric_snapshots s
join points p on p.id = s.point_id
where p.created_by = auth.uid()
order by s.day`

// GetBusinessAnalytics returns the time-series graphs for the caller's points and,
// as a side effect, records today's view/search totals so the metric history grows
// forward with each dashboard visit ("snapshot on read").
func (s *Store) GetBusinessAnalytics(ctx context.Context, userID string) (BusinessAnalytics, error) {
	out := BusinessAnalytics{Reviews: []ReviewPoint{}, Metrics: []MetricDay{}}
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		if _, e := tx.Exec(ctx, `select snapshot_my_point_metrics()`); e != nil {
			return e
		}

		rrows, e := tx.Query(ctx, reviewsHistorySQL)
		if e != nil {
			return e
		}
		for rrows.Next() {
			var rp ReviewPoint
			if e := rrows.Scan(&rp.PointID, &rp.CreatedAt, &rp.Stars); e != nil {
				rrows.Close()
				return e
			}
			out.Reviews = append(out.Reviews, rp)
		}
		rrows.Close()
		if e := rrows.Err(); e != nil {
			return e
		}

		mrows, e := tx.Query(ctx, metricsHistorySQL)
		if e != nil {
			return e
		}
		defer mrows.Close()
		for mrows.Next() {
			var day time.Time
			var md MetricDay
			if e := mrows.Scan(&day, &md.PointID, &md.ViewCount, &md.SearchAppearances); e != nil {
				return e
			}
			md.Day = day.Format("2006-01-02")
			out.Metrics = append(out.Metrics, md)
		}
		return mrows.Err()
	})
	return out, classify(err)
}
