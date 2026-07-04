package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// MyPoint is one point the caller created, for their dashboard.
type MyPoint struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Category     string    `json:"category"`
	Address      *string   `json:"address"`
	VerifyStatus string    `json:"verifyStatus"`
	ViewCount    int       `json:"viewCount"`
	CreatedAt    time.Time `json:"createdAt"`
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
select id::text, name, category::text, address, verify_status::text, view_count, created_at
from points where created_by = auth.uid() order by created_at desc`

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
			if err := rows.Scan(&p.ID, &p.Name, &p.Category, &p.Address, &p.VerifyStatus, &p.ViewCount, &p.CreatedAt); err != nil {
				return err
			}
			me.Points = append(me.Points, p)
		}
		return rows.Err()
	})
	return me, classify(err)
}
