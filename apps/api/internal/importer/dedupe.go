package importer

import (
	"context"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Dedupe defaults (overridable via the CLI / env).
const (
	DefaultRadiusM = 30.0
	DefaultNameSim = 0.6
)

// DedupeRow is a point considered for merging.
type DedupeRow struct {
	ID           string
	Name         string
	Category     string
	VerifyStatus string
	CreatedAt    time.Time
	Photos       []string
	Lng, Lat     float64
	NFeatures    int
}

// Merge is a survivor and the duplicates folded into it.
type Merge struct {
	Survivor DedupeRow
	Dups     []DedupeRow
}

// DedupeReport summarizes a dedupe run.
type DedupeReport struct {
	Scanned int
	Merges  []Merge
	Applied bool
}

// MergedCount is the total number of duplicate rows folded away.
func (r DedupeReport) MergedCount() int {
	n := 0
	for _, m := range r.Merges {
		n += len(m.Dups)
	}
	return n
}

var punctRe = regexp.MustCompile(`[«»"'’.,()]+`)
var spaceRe = regexp.MustCompile(`\s+`)

func normalizeName(s string) string {
	s = strings.ToLower(s)
	s = punctRe.ReplaceAllString(s, " ")
	s = spaceRe.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

func nameTokens(s string) map[string]struct{} {
	set := map[string]struct{}{}
	for _, tok := range strings.Fields(normalizeName(s)) {
		set[tok] = struct{}{}
	}
	return set
}

// jaccard is the token-set Jaccard similarity of two names.
func jaccard(a, b string) float64 {
	A, B := nameTokens(a), nameTokens(b)
	if len(A) == 0 || len(B) == 0 {
		return 0
	}
	inter := 0
	for x := range A {
		if _, ok := B[x]; ok {
			inter++
		}
	}
	return float64(inter) / float64(len(A)+len(B)-inter)
}

// metersBetween is an equirectangular-approx distance in metres.
func metersBetween(aLat, aLng, bLat, bLng float64) float64 {
	const R = 6371000
	dLat := (bLat - aLat) * math.Pi / 180
	dLng := (bLng - aLng) * math.Pi / 180
	lat := (aLat + bLat) / 2 * math.Pi / 180
	x := dLng * math.Cos(lat)
	return math.Sqrt(x*x+dLat*dLat) * R
}

func ufFind(parent []int, i int) int {
	for parent[i] != i {
		parent[i] = parent[parent[i]]
		i = parent[i]
	}
	return i
}

func ufUnion(parent []int, i, j int) { parent[ufFind(parent, i)] = ufFind(parent, j) }

func score(r DedupeRow) int {
	s := r.NFeatures * 10
	switch r.VerifyStatus {
	case "official":
		s += 5
	case "verified":
		s += 3
	}
	return s
}

// clusterDuplicates groups rows that share a category, sit within radiusM, and
// have name similarity ≥ nameSim, returning one Merge per cluster of size ≥ 2.
// The survivor is the highest-scoring (most features, most trusted), oldest first.
func clusterDuplicates(rows []DedupeRow, radiusM, nameSim float64) []Merge {
	parent := make([]int, len(rows))
	for i := range parent {
		parent[i] = i
	}
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			if rows[i].Category != rows[j].Category {
				continue
			}
			if metersBetween(rows[i].Lat, rows[i].Lng, rows[j].Lat, rows[j].Lng) > radiusM {
				continue
			}
			if jaccard(rows[i].Name, rows[j].Name) < nameSim {
				continue
			}
			ufUnion(parent, i, j)
		}
	}

	groups := map[int][]int{}
	for i := range rows {
		root := ufFind(parent, i)
		groups[root] = append(groups[root], i)
	}

	// Deterministic order: by smallest member index.
	roots := make([]int, 0, len(groups))
	for r := range groups {
		roots = append(roots, r)
	}
	sort.Ints(roots)

	var merges []Merge
	for _, r := range roots {
		idxs := groups[r]
		if len(idxs) < 2 {
			continue
		}
		members := make([]DedupeRow, len(idxs))
		for k, i := range idxs {
			members[k] = rows[i]
		}
		sort.SliceStable(members, func(a, b int) bool {
			if sa, sb := score(members[a]), score(members[b]); sa != sb {
				return sa > sb
			}
			return members[a].CreatedAt.Before(members[b].CreatedAt)
		})
		merges = append(merges, Merge{Survivor: members[0], Dups: members[1:]})
	}
	return merges
}

const dedupeLoadSQL = `
select p.id::text, p.name, p.category::text, p.verify_status::text, p.created_at, p.photos,
       ST_X(p.geom::geometry) as lng, ST_Y(p.geom::geometry) as lat,
       (select count(*) from point_feature_values fv where fv.point_id = p.id)::int as nfeatures
from points p order by p.created_at`

// Dedupe scans all points and merges proximity+name duplicates. Dry-run unless
// apply is true.
func Dedupe(ctx context.Context, pool *pgxpool.Pool, radiusM, nameSim float64, apply bool) (DedupeReport, error) {
	rows, err := loadDedupeRows(ctx, pool)
	if err != nil {
		return DedupeReport{}, err
	}
	report := DedupeReport{Scanned: len(rows), Merges: clusterDuplicates(rows, radiusM, nameSim), Applied: apply}
	if !apply {
		return report, nil
	}
	for _, m := range report.Merges {
		if err := applyMerge(ctx, pool, m); err != nil {
			return report, fmt.Errorf("merge into %s: %w", m.Survivor.ID, err)
		}
	}
	return report, nil
}

func loadDedupeRows(ctx context.Context, pool *pgxpool.Pool) ([]DedupeRow, error) {
	rows, err := pool.Query(ctx, dedupeLoadSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DedupeRow
	for rows.Next() {
		var r DedupeRow
		if err := rows.Scan(&r.ID, &r.Name, &r.Category, &r.VerifyStatus, &r.CreatedAt,
			&r.Photos, &r.Lng, &r.Lat, &r.NFeatures); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// applyMerge folds each duplicate into the survivor inside one transaction.
func applyMerge(ctx context.Context, pool *pgxpool.Pool, m Merge) (err error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	photos := append([]string{}, m.Survivor.Photos...)
	for _, dup := range m.Dups {
		// Move feature values the survivor lacks, then drop the rest.
		if _, err = tx.Exec(ctx, `
			update point_feature_values fv set point_id = $1
			where fv.point_id = $2
			  and not exists (select 1 from point_feature_values s
			                  where s.point_id = $1 and s.feature_key = fv.feature_key)`,
			m.Survivor.ID, dup.ID); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `delete from point_feature_values where point_id = $1`, dup.ID); err != nil {
			return err
		}
		// Repoint reviews the survivor lacks for that user/profile, drop the rest.
		if _, err = tx.Exec(ctx, `
			update reviews r set point_id = $1
			where r.point_id = $2
			  and not exists (select 1 from reviews s
			                  where s.point_id = $1 and s.user_id = r.user_id and s.profile = r.profile)`,
			m.Survivor.ID, dup.ID); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `delete from reviews where point_id = $1`, dup.ID); err != nil {
			return err
		}
		// Repoint problems.
		if _, err = tx.Exec(ctx, `update problems set point_id = $1 where point_id = $2`,
			m.Survivor.ID, dup.ID); err != nil {
			return err
		}
		photos = mergePhotos(photos, dup.Photos)
		if _, err = tx.Exec(ctx, `delete from points where id = $1`, dup.ID); err != nil {
			return err
		}
	}
	if _, err = tx.Exec(ctx, `update points set photos = $1 where id = $2`, photos, m.Survivor.ID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func mergePhotos(a, b []string) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, p := range append(append([]string{}, a...), b...) {
		if _, ok := seen[p]; !ok {
			seen[p] = struct{}{}
			out = append(out, p)
		}
	}
	return out
}
