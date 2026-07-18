package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// Moderation data access. Every write runs through WithUser so the moderator
// RLS policies (is_moderator()) enforce authorization in the database as well
// as at the middleware — an update/delete that touches 0 rows maps to
// ErrNotFound.

// AdminPoint is a point row in the moderation queue. RequestedAt is set when the
// point's owner has asked for verification (nil otherwise).
type AdminPoint struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Category     string     `json:"category"`
	Address      *string    `json:"address"`
	VerifyStatus string     `json:"verifyStatus"`
	RequestedAt  *time.Time `json:"requestedAt"`
}

// Owner-requested points surface first (newest request), then the rest newest-first.
const unverifiedPointsSQL = `
select id::text, name, category::text, address, verify_status::text, verification_requested_at
from points
where verify_status = 'unverified'
order by (verification_requested_at is not null) desc,
         verification_requested_at desc nulls last,
         created_at desc`

// UnverifiedPoints lists points awaiting verification, newest first.
func (s *Store) UnverifiedPoints(ctx context.Context) ([]AdminPoint, error) {
	rows, err := s.db.Pool.Query(ctx, unverifiedPointsSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []AdminPoint{}
	for rows.Next() {
		var p AdminPoint
		if err := rows.Scan(&p.ID, &p.Name, &p.Category, &p.Address, &p.VerifyStatus, &p.RequestedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SetPointVerify updates a point's verification status.
func (s *Store) SetPointVerify(ctx context.Context, userID, pointID, status string) error {
	return s.modExec(ctx, userID,
		"update points set verify_status = $2::verify_status where id = $1::uuid", pointID, status)
}

// DeletePoint removes a point (cascades to features/reviews via FKs).
func (s *Store) DeletePoint(ctx context.Context, userID, pointID string) error {
	return s.modExec(ctx, userID, "delete from points where id = $1::uuid", pointID)
}

// AdminProblem is a problem row in the moderation queue.
type AdminProblem struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Status        string `json:"status"`
	Confirmations int    `json:"confirmations"`
}

const openProblemsSQL = `
select id::text, title, status::text, confirmations
from problems
where status <> 'resolved'
order by confirmations desc, created_at desc`

// OpenProblems lists unresolved problems, most-confirmed first.
func (s *Store) OpenProblems(ctx context.Context) ([]AdminProblem, error) {
	rows, err := s.db.Pool.Query(ctx, openProblemsSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []AdminProblem{}
	for rows.Next() {
		var p AdminProblem
		if err := rows.Scan(&p.ID, &p.Title, &p.Status, &p.Confirmations); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ResolveProblem marks a problem resolved.
func (s *Store) ResolveProblem(ctx context.Context, userID, problemID string) error {
	return s.modExec(ctx, userID,
		"update problems set status = 'resolved', resolved_at = now() where id = $1::uuid", problemID)
}

// DeleteProblem removes a problem (cascades to confirmations/petitions).
func (s *Store) DeleteProblem(ctx context.Context, userID, problemID string) error {
	return s.modExec(ctx, userID, "delete from problems where id = $1::uuid", problemID)
}

// AdminReview is a review row in the moderation queue.
type AdminReview struct {
	ID        string    `json:"id"`
	Stars     int       `json:"stars"`
	Text      *string   `json:"text"`
	Profile   string    `json:"profile"`
	PointName *string   `json:"point_name"`
	CreatedAt time.Time `json:"created_at"`
}

const recentReviewsSQL = `
select r.id::text, r.stars, r.text, r.profile::text, p.name, r.created_at
from reviews r
left join points p on p.id = r.point_id
order by r.created_at desc
limit $1`

// RecentReviews lists the newest reviews with their point names.
func (s *Store) RecentReviews(ctx context.Context, limit int) ([]AdminReview, error) {
	rows, err := s.db.Pool.Query(ctx, recentReviewsSQL, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []AdminReview{}
	for rows.Next() {
		var r AdminReview
		if err := rows.Scan(&r.ID, &r.Stars, &r.Text, &r.Profile, &r.PointName, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// DeleteReview removes a review.
func (s *Store) DeleteReview(ctx context.Context, userID, reviewID string) error {
	return s.modExec(ctx, userID, "delete from reviews where id = $1::uuid", reviewID)
}

// AdminSegment is a segment row in the moderation queue.
type AdminSegment struct {
	ID          string  `json:"id"`
	StreetName  *string `json:"street_name"`
	SurfaceType *string `json:"surface_type"`
	Rating      string  `json:"rating"`
	CreatedAt   string  `json:"created_at"`
}

const listSegmentsSQL = `
select
  s.id::text,
  s.street_name,
  s.surface_type,
  segment_rating(s.surface_type, s.smoothness, s.sidewalk_width_m, s.incline_percent,
    s.is_step_free, s.lit, s.has_curb_cuts, s.has_tactile_paving, s.is_obstacle_free) as rating,
  s.created_at::text
from street_segments s
where s.created_by is not null
order by s.created_at desc
limit $1`

// ListUserSegments lists user-submitted segments (excludes OSM imports), newest first.
func (s *Store) ListUserSegments(ctx context.Context, limit int) ([]AdminSegment, error) {
	rows, err := s.db.Pool.Query(ctx, listSegmentsSQL, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []AdminSegment{}
	for rows.Next() {
		var seg AdminSegment
		if err := rows.Scan(&seg.ID, &seg.StreetName, &seg.SurfaceType, &seg.Rating, &seg.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, seg)
	}
	return out, rows.Err()
}

// DeleteSegment removes a user-submitted segment.
func (s *Store) DeleteSegment(ctx context.Context, userID, segmentID string) error {
	return s.modExec(ctx, userID, "delete from street_segments where id = $1::uuid and created_by is not null", segmentID)
}

// AdminUser is a profile row for role management.
type AdminUser struct {
	ID          string  `json:"id"`
	DisplayName *string `json:"display_name"`
	Role        string  `json:"role"`
}

const listUsersSQL = `
select id::text, display_name, role::text
from profiles
order by created_at desc
limit $1`

// ListUsers lists profiles, newest first.
func (s *Store) ListUsers(ctx context.Context, limit int) ([]AdminUser, error) {
	rows, err := s.db.Pool.Query(ctx, listUsersSQL, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []AdminUser{}
	for rows.Next() {
		var u AdminUser
		if err := rows.Scan(&u.ID, &u.DisplayName, &u.Role); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// SetUserRole changes a user's application role.
func (s *Store) SetUserRole(ctx context.Context, userID, targetID, role string) error {
	return s.modExec(ctx, userID,
		"update profiles set role = $2::user_role where id = $1::uuid", targetID, role)
}

// modExec runs a single moderation statement under the caller's RLS claims and
// maps "0 rows touched" to ErrNotFound.
func (s *Store) modExec(ctx context.Context, userID, sql string, args ...any) error {
	err := s.db.WithUser(ctx, userID, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx, sql, args...)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	})
	return classify(err)
}
