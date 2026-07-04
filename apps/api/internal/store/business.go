package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
)

// BusinessPointRow is a point joined with its business_listings state, for the
// owner's dashboard (/business/points/me).
type BusinessPointRow struct {
	PointID              string     `json:"pointId"`
	Name                 string     `json:"name"`
	Category             string     `json:"category"`
	Address              *string    `json:"address"`
	VerifyStatus         string     `json:"verifyStatus"`
	VerifiedPaid         bool       `json:"verifiedPaid"`
	VerifiedPaidAt       *time.Time `json:"verifiedPaidAt"`
	SubscriptionStatus   string     `json:"subscriptionStatus"`
	SubscriptionPlan     *string    `json:"subscriptionPlan"`
	SubscriptionRenewsAt *time.Time `json:"subscriptionRenewsAt"`
	CreatedAt            time.Time  `json:"createdAt"`
}

const insertBusinessListingSQL = `insert into business_listings (point_id, owner_id) values ($1::uuid, auth.uid())`

// CreateBusinessPoint inserts a point (via the existing add_point RPC) and its
// business_listings row in the same transaction, so a point is never left in a
// half-business state if either insert fails. Businesses can only add new
// points — there is no path here to attach a listing to an existing point.
func (s *Store) CreateBusinessPoint(ctx context.Context, userID string, in NewPoint) (string, error) {
	featuresJSON := []byte("{}")
	if len(in.Features) > 0 {
		b, err := json.Marshal(in.Features)
		if err != nil {
			return "", err
		}
		featuresJSON = b
	}

	var id string
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, addPointSQL,
			in.Name, in.Category, in.Lng, in.Lat,
			nullable(in.Address), nullable(in.Description),
			string(featuresJSON), in.Photos,
		).Scan(&id); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, insertBusinessListingSQL, id)
		return err
	})
	return id, classify(err)
}

const myBusinessPointsSQL = `
select p.id::text, p.name, p.category::text, p.address, p.verify_status::text,
       bl.verified_paid, bl.verified_paid_at, bl.subscription_status, bl.subscription_plan,
       bl.subscription_renews_at, bl.created_at
from business_listings bl
join points p on p.id = bl.point_id
where bl.owner_id = auth.uid()
order by bl.created_at desc`

// MyBusinessPoints lists the caller's business points with their verify/subscription
// state, newest first. business_listings' read policy is public (read_all), so the
// owner filter here — not RLS — is what scopes this to the caller.
func (s *Store) MyBusinessPoints(ctx context.Context, userID string) ([]BusinessPointRow, error) {
	var out []BusinessPointRow
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, myBusinessPointsSQL)
		if err != nil {
			return err
		}
		defer rows.Close()
		out = []BusinessPointRow{}
		for rows.Next() {
			var r BusinessPointRow
			if err := rows.Scan(&r.PointID, &r.Name, &r.Category, &r.Address, &r.VerifyStatus,
				&r.VerifiedPaid, &r.VerifiedPaidAt, &r.SubscriptionStatus, &r.SubscriptionPlan,
				&r.SubscriptionRenewsAt, &r.CreatedAt); err != nil {
				return err
			}
			out = append(out, r)
		}
		return rows.Err()
	})
	return out, classify(err)
}

const markVerifiedPaidSQL = `
update business_listings set verified_paid = true, verified_paid_at = now()
where point_id = $1::uuid and owner_id = auth.uid()`

// MarkVerifiedPaid flips a business listing to verified+paid. MOCK: no payment
// processor is involved — see the owner_update policy comment in
// 0017_business_listings.sql. ErrNotFound if the point isn't the caller's
// business listing.
func (s *Store) MarkVerifiedPaid(ctx context.Context, userID, pointID string) error {
	return s.modExec(ctx, userID, markVerifiedPaidSQL, pointID)
}

const setSubscriptionSQL = `
update business_listings
set subscription_status = 'active',
    subscription_plan = $2,
    subscription_renews_at = now() + case when $2 = 'yearly' then interval '365 days' else interval '30 days' end
where point_id = $1::uuid and owner_id = auth.uid()`

// SetSubscription activates a subscription plan (monthly|yearly) for a business
// listing, boosting its search-result priority while active. MOCK: no payment
// processor is involved — see the owner_update policy comment in
// 0017_business_listings.sql. ErrNotFound if the point isn't the caller's
// business listing.
func (s *Store) SetSubscription(ctx context.Context, userID, pointID, plan string) error {
	return s.modExec(ctx, userID, setSubscriptionSQL, pointID, plan)
}
