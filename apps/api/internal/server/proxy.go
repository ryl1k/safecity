package server

import (
	"errors"
	"math"
	"net/http"
	"sort"
	"strconv"

	"github.com/safecity/api/internal/geo"
	"github.com/safecity/api/internal/httpx"
	"github.com/safecity/api/internal/store"
)

// walkingSpeedMps is used to estimate duration from pgRouting distance.
const walkingSpeedMps = 1.1 // ~4 km/h

// routeRequest is the body for POST /route. from/to are [lng,lat]. The avoid
// polygons are built server-side from confirmed problems, so the client only
// sends endpoints + profile.
type routeRequest struct {
	From    *[2]float64  `json:"from" validate:"required"`
	To      *[2]float64  `json:"to" validate:"required"`
	Via     [][2]float64 `json:"via" validate:"omitempty,max=10"` // intermediate stops, in order
	Profile string       `json:"profile" validate:"omitempty,oneof=wheelchair blind"`
	Params  *routeParams `json:"params"`
	// Strict widens avoidance to also steer clear of "partial" (marginal) segments,
	// not just "none" (impassable) ones. Off by default.
	Strict bool `json:"strict"`
}

type routeParams struct {
	MaxIncline    *float64 `json:"maxIncline" validate:"omitempty,gte=0,lte=15"`
	MaxSlopedKerb *float64 `json:"maxSlopedKerb" validate:"omitempty,gte=0,lte=1"`
	MinWidth      *float64 `json:"minWidth" validate:"omitempty,gte=0,lte=5"`
}

// avoidPad widens the route bounding box when searching for barriers (matches web).
const avoidPad = 0.003

func (s *Server) handleRoute(w http.ResponseWriter, r *http.Request) {
	var req routeRequest
	if !httpx.Decode(w, r, &req) {
		return
	}
	from, to := *req.From, *req.To
	if !validLngLat(from[0], from[1]) || !validLngLat(to[0], to[1]) {
		httpx.Error(w, http.StatusBadRequest, "invalid_query", "from/to must be [lng,lat] within range")
		return
	}
	for _, v := range req.Via {
		if !validLngLat(v[0], v[1]) {
			httpx.Error(w, http.StatusBadRequest, "invalid_query", "via must be [lng,lat] within range")
			return
		}
	}

	// blind users route on foot; everyone else gets the wheelchair profile.
	wanted := "wheelchair"
	if req.Profile == "blind" {
		wanted = "foot-walking"
	}
	rest := geo.DefaultRestrictions()
	if req.Params != nil {
		if req.Params.MaxIncline != nil {
			rest.MaxIncline = *req.Params.MaxIncline
		}
		if req.Params.MaxSlopedKerb != nil {
			rest.MaxSlopedKerb = *req.Params.MaxSlopedKerb
		}
		if req.Params.MinWidth != nil {
			rest.MinWidth = *req.Params.MinWidth
		}
	}

	// Gather barriers. `problems` are point barriers (confirmed reports); `noneSegs`
	// / `partialSegs` are rated segments with a BUFFERED avoid polygon (covers the
	// whole path, not just a point) + the raw line (to detect residual crossings).
	// Best-effort — a lookup failure must never block routing.
	var problems [][2]float64
	var noneSegs, partialSegs []store.SegmentAvoid
	if s.store != nil {
		// Span every leg (from → via… → to) so barriers near a stop are caught too.
		minLng, maxLng, minLat, maxLat := from[0], from[0], from[1], from[1]
		for _, p := range append([][2]float64{to}, req.Via...) {
			minLng, maxLng = math.Min(minLng, p[0]), math.Max(maxLng, p[0])
			minLat, maxLat = math.Min(minLat, p[1]), math.Max(maxLat, p[1])
		}
		minLng, maxLng = minLng-avoidPad, maxLng+avoidPad
		minLat, maxLat = minLat-avoidPad, maxLat+avoidPad

		if barriers, err := s.store.BarriersInBBox(r.Context(), minLng, minLat, maxLng, maxLat); err != nil {
			s.log.Warn("route barrier lookup failed", "err", err)
		} else {
			for _, b := range barriers {
				problems = append(problems, [2]float64{b.Lng, b.Lat})
			}
		}
		if wanted == "wheelchair" {
			if segs, err := s.store.SegmentAvoidsInBBox(r.Context(), minLng, minLat, maxLng, maxLat, []string{"none"}, 3*maxAvoidPolys); err != nil {
				s.log.Warn("route none-segment lookup failed", "err", err)
			} else {
				noneSegs = segs
			}
			if req.Strict {
				if segs, err := s.store.SegmentAvoidsInBBox(r.Context(), minLng, minLat, maxLng, maxLat, []string{"partial"}, 3*maxAvoidPolys); err != nil {
					s.log.Warn("route partial-segment lookup failed", "err", err)
				} else {
					partialSegs = segs
				}
			}
		}
	}

	mid := func(sa store.SegmentAvoid) [2]float64 { return [2]float64{sa.Mid.Lng, sa.Mid.Lat} }

	// The "avoided" count is corridor-scoped (barriers on streets the trip actually
	// passes) — the avoid SET below is bbox-scoped so a curving route still dodges
	// segments beside the straight line.
	var corridorPts [][2]float64
	for _, p := range problems {
		if distPointToSegMeters(p, from, to) <= corridorMeters {
			corridorPts = append(corridorPts, p)
		}
	}
	countSegs := noneSegs
	if req.Strict {
		countSegs = append(append([]store.SegmentAvoid{}, noneSegs...), partialSegs...)
	}
	for _, sa := range countSegs {
		if distPointToSegMeters(mid(sa), from, to) <= corridorMeters {
			corridorPts = append(corridorPts, mid(sa))
		}
	}
	avoidedBy := func(route [][]float64) int {
		n := 0
		for _, b := range corridorPts {
			if distPointToPathMeters(b, route) > clearMeters {
				n++
			}
		}
		return n
	}
	// crossesRedBy: impassable ("none") segments the FINAL route still runs along
	// (some are the only connection — honest signal when avoidance can't help).
	crossesRedBy := func(route [][]float64) int {
		n := 0
		for _, sa := range noneSegs {
			for _, v := range sa.Line {
				if distPointToPathMeters([2]float64{v[0], v[1]}, route) <= crossMeters {
					n++
					break
				}
			}
		}
		return n
	}

	// For wheelchair profile, try pgRouting first — it uses our segment graph
	// with accessibility-weighted costs (full 1×, partial 1.5×, unknown 3×,
	// none 100×). Fall through to ORS when pgRouting has no path.
	if wanted == "wheelchair" && s.store != nil && len(req.Via) == 0 {
		if ar, err := s.store.RouteAccessible(r.Context(), from[0], from[1], to[0], to[1]); err == nil && ar != nil && len(ar.Coordinates) > 1 {
			httpx.JSON(w, http.StatusOK, geo.RouteResult{
				Profile:     "wheelchair",
				Avoided:     avoidedBy(ar.Coordinates),
				CrossesRed:  crossesRedBy(ar.Coordinates),
				Coordinates: ar.Coordinates,
				Steps:       []geo.Step{},
				Summary: &geo.Summary{
					Distance: ar.DistanceM,
					Duration: ar.DistanceM / walkingSpeedMps,
				},
			})
			return
		}
	}

	// Build an ORS avoid MultiPolygon from problem squares + segment buffer polygons,
	// capping segments nearest the direct line so we stay under ORS's polygon budget.
	segBudget := maxAvoidPolys - len(problems)
	if segBudget < 0 {
		segBudget = 0
	}
	capSegs := func(segs []store.SegmentAvoid) []store.SegmentAvoid {
		segs = append([]store.SegmentAvoid{}, segs...)
		if len(segs) > segBudget {
			sort.Slice(segs, func(i, j int) bool {
				return distPointToSegMeters(mid(segs[i]), from, to) < distPointToSegMeters(mid(segs[j]), from, to)
			})
			s.log.Warn("route avoid set capped", "have", len(segs), "cap", segBudget)
			segs = segs[:segBudget]
		}
		return segs
	}
	mkAvoid := func(segs []store.SegmentAvoid) [][][][]float64 {
		out := geo.AvoidSquares(problems)
		for _, sa := range capSegs(segs) {
			if len(sa.Poly) >= 4 {
				ring := make([][]float64, len(sa.Poly))
				for i, c := range sa.Poly {
					ring[i] = []float64{c[0], c[1]}
				}
				out = append(out, [][][]float64{ring})
			}
		}
		return out
	}

	// Relax ladder: strict(none+partial) → none → no avoidance. Over-constrained
	// requests (ErrNoRoute) drop a tier so the user always gets a best-effort route.
	var ladder [][][][][]float64
	if req.Strict && len(partialSegs) > 0 {
		ladder = append(ladder, mkAvoid(append(append([]store.SegmentAvoid{}, noneSegs...), partialSegs...)))
	}
	ladder = append(ladder, mkAvoid(noneSegs))
	ladder = append(ladder, nil) // last resort: no avoidance at all

	var res geo.RouteResult
	var err error
	for i, avoid := range ladder {
		res, err = s.geo.Route(r.Context(), geo.RouteInput{
			From:         from,
			To:           to,
			Via:          req.Via,
			Profile:      wanted,
			Restrictions: rest,
			Avoid:        avoid,
		})
		if err == nil {
			break
		}
		if errors.Is(err, geo.ErrNoRoute) && i < len(ladder)-1 {
			s.log.Info("route over-constrained, relaxing avoidance", "attempt", i)
			continue
		}
		break
	}
	if err != nil {
		if errors.Is(err, geo.ErrUnavailable) {
			httpx.Error(w, http.StatusServiceUnavailable, "unavailable", "routing is not configured")
			return
		}
		if errors.Is(err, geo.ErrNoRoute) {
			httpx.Error(w, http.StatusNotFound, "no_route", "не вдалося прокласти маршрут між цими точками")
			return
		}
		s.log.Error("route", "err", err)
		httpx.Error(w, http.StatusBadGateway, "upstream_error", "routing failed")
		return
	}
	res.Avoided = avoidedBy(res.Coordinates) // authoritative, replaces geo's polygon count
	res.CrossesRed = crossesRedBy(res.Coordinates)
	httpx.JSON(w, http.StatusOK, res)
}

// Corridor + clearance thresholds for barrier avoidance/counting, and the cap on
// avoid polygons sent to ORS.
const (
	corridorMeters = 110.0 // barrier must be within this of the direct line to count
	clearMeters    = 25.0  // route must be at least this far from a barrier to "avoid" it
	crossMeters    = 10.0  // route within this of a "none" segment = still runs along it
	maxAvoidPolys  = 100   // ORS can fail with too many avoid polygons
)

// distPointToPathMeters is the shortest distance from a point to a polyline.
func distPointToPathMeters(p [2]float64, path [][]float64) float64 {
	if len(path) == 0 {
		return math.Inf(1)
	}
	if len(path) == 1 {
		return metersBetween(p, [2]float64{path[0][0], path[0][1]})
	}
	best := math.Inf(1)
	for i := 0; i+1 < len(path); i++ {
		a := [2]float64{path[i][0], path[i][1]}
		b := [2]float64{path[i+1][0], path[i+1][1]}
		if d := distPointToSegMeters(p, a, b); d < best {
			best = d
		}
	}
	return best
}

// distPointToSegMeters is the distance from p to segment a–b, using a local
// equirectangular projection (accurate at city scale).
func distPointToSegMeters(p, a, b [2]float64) float64 {
	latRad := a[1] * math.Pi / 180
	mPerDegLat := 110540.0
	mPerDegLng := 111320.0 * math.Cos(latRad)
	px := (p[0] - a[0]) * mPerDegLng
	py := (p[1] - a[1]) * mPerDegLat
	bx := (b[0] - a[0]) * mPerDegLng
	by := (b[1] - a[1]) * mPerDegLat
	segLen2 := bx*bx + by*by
	if segLen2 == 0 {
		return math.Hypot(px, py)
	}
	t := (px*bx + py*by) / segLen2
	t = math.Max(0, math.Min(1, t))
	dx := px - t*bx
	dy := py - t*by
	return math.Hypot(dx, dy)
}

func metersBetween(a, b [2]float64) float64 {
	latRad := a[1] * math.Pi / 180
	dx := (b[0] - a[0]) * 111320.0 * math.Cos(latRad)
	dy := (b[1] - a[1]) * 110540.0
	return math.Hypot(dx, dy)
}

// handleGeocode: GET /geocode?q=&limit= — public address search.
func (s *Server) handleGeocode(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	limit := 5
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			limit = n
		}
	}
	places, err := s.geo.Geocode(r.Context(), q, limit)
	if err != nil {
		s.log.Error("geocode", "err", err)
		httpx.Error(w, http.StatusBadGateway, "upstream_error", "geocoding failed")
		return
	}
	httpx.JSON(w, http.StatusOK, places)
}

// handleReverseGeocode: GET /geocode/reverse?lng=&lat= — coords → nearest address.
func (s *Server) handleReverseGeocode(w http.ResponseWriter, r *http.Request) {
	lng, okLng := floatQuery(r.URL.Query().Get("lng"))
	lat, okLat := floatQuery(r.URL.Query().Get("lat"))
	if !okLng || !okLat || !validLngLat(lng, lat) {
		httpx.Error(w, http.StatusBadRequest, "invalid_query", "lng and lat are required numbers in range")
		return
	}
	place, err := s.geo.Reverse(r.Context(), lng, lat)
	if err != nil {
		s.log.Error("reverse geocode", "err", err)
		httpx.Error(w, http.StatusBadGateway, "upstream_error", "reverse geocoding failed")
		return
	}
	if place == nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "no address for this location")
		return
	}
	httpx.JSON(w, http.StatusOK, place)
}
