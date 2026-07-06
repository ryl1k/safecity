package server

import (
	"errors"
	"math"
	"net/http"
	"sort"
	"strconv"

	"github.com/safecity/api/internal/geo"
	"github.com/safecity/api/internal/httpx"
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

	// Gather barrier points to avoid, kept in two tiers so we can relax gracefully:
	//   base    = confirmed/escalated problems + "none" (impassable) segments — always avoid
	//   partial = marginal segments — only avoided in strict mode
	// Best-effort — a lookup failure must never block routing.
	var base, partial [][2]float64
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
				base = append(base, [2]float64{b.Lng, b.Lat})
			}
		}
		if wanted == "wheelchair" {
			if segs, err := s.store.SegmentMidpointsInBBox(r.Context(), minLng, minLat, maxLng, maxLat, []string{"none"}, 2*maxAvoidPolys); err != nil {
				s.log.Warn("route none-segment lookup failed", "err", err)
			} else {
				for _, p := range segs {
					base = append(base, [2]float64{p.Lng, p.Lat})
				}
			}
			if req.Strict {
				if segs, err := s.store.SegmentMidpointsInBBox(r.Context(), minLng, minLat, maxLng, maxLat, []string{"partial"}, 2*maxAvoidPolys); err != nil {
					s.log.Warn("route partial-segment lookup failed", "err", err)
				} else {
					for _, p := range segs {
						partial = append(partial, [2]float64{p.Lng, p.Lat})
					}
				}
			}
		}
	}

	// Scope to the direct from→to corridor so we don't avoid (or credit avoiding)
	// barriers on streets the trip would never touch.
	inCorridor := func(pts [][2]float64) [][2]float64 {
		out := pts[:0:0]
		for _, c := range pts {
			if distPointToSegMeters(c, from, to) <= corridorMeters {
				out = append(out, c)
			}
		}
		return out
	}
	base, partial = inCorridor(base), inCorridor(partial)
	corridor := append(append([][2]float64{}, base...), partial...) // all known barriers, for counting

	// Honest "avoided" count: corridor barriers the CHOSEN route actually steers
	// clear of (far from the polyline). Same measure for both engines.
	avoidedBy := func(route [][]float64) int {
		n := 0
		for _, b := range corridor {
			if distPointToPathMeters(b, route) > clearMeters {
				n++
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

	// ORS with a relax ladder: strict (base+partial) → base-only → no avoidance.
	// Over-constrained requests (ErrNoRoute) drop to the next tier so the user
	// always gets a best-effort route rather than a hard failure.
	capNearest := func(pts [][2]float64) [][2]float64 {
		pts = append([][2]float64{}, pts...)
		if len(pts) > maxAvoidPolys {
			sort.Slice(pts, func(i, j int) bool {
				return distPointToSegMeters(pts[i], from, to) < distPointToSegMeters(pts[j], from, to)
			})
			s.log.Warn("route avoid set capped", "have", len(pts), "cap", maxAvoidPolys)
			pts = pts[:maxAvoidPolys]
		}
		return pts
	}
	ladder := [][][2]float64{}
	if len(partial) > 0 {
		ladder = append(ladder, append(append([][2]float64{}, base...), partial...))
	}
	ladder = append(ladder, base) // base may be empty — that's the plain route
	if len(base) > 0 {
		ladder = append(ladder, nil) // last resort: no avoidance at all
	}

	var res geo.RouteResult
	var err error
	for i, set := range ladder {
		capped := capNearest(set)
		var avoid [][][][]float64
		if len(capped) > 0 {
			avoid = geo.AvoidSquares(capped)
		}
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
	httpx.JSON(w, http.StatusOK, res)
}

// Corridor + clearance thresholds for barrier avoidance/counting, and the cap on
// avoid polygons sent to ORS.
const (
	corridorMeters = 110.0 // barrier must be within this of the direct line to count
	clearMeters    = 25.0  // route must be at least this far from a barrier to "avoid" it
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
