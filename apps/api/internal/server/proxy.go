package server

import (
	"errors"
	"math"
	"net/http"
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

	// Build avoidance polygons from confirmed/escalated problems AND "none"-rated
	// (red/impassable) street segments in the corridor. Best-effort: failures
	// must not block routing.
	var avoid [][][][]float64
	if s.store != nil {
		// Span every leg (from → via… → to) so barriers near a stop are caught too.
		minLng, maxLng, minLat, maxLat := from[0], from[0], from[1], from[1]
		for _, p := range append([][2]float64{to}, req.Via...) {
			minLng, maxLng = math.Min(minLng, p[0]), math.Max(maxLng, p[0])
			minLat, maxLat = math.Min(minLat, p[1]), math.Max(maxLat, p[1])
		}
		minLng, maxLng = minLng-avoidPad, maxLng+avoidPad
		minLat, maxLat = minLat-avoidPad, maxLat+avoidPad

		var avoidPts [][2]float64
		if barriers, err := s.store.BarriersInBBox(r.Context(), minLng, minLat, maxLng, maxLat); err != nil {
			s.log.Warn("route barrier lookup failed", "err", err)
		} else {
			for _, b := range barriers {
				avoidPts = append(avoidPts, [2]float64{b.Lng, b.Lat})
			}
		}
		// For wheelchair routing, also avoid segments rated "none" (impassable).
		if wanted == "wheelchair" {
			if redSegs, err := s.store.NoneSegmentMidpointsInBBox(r.Context(), minLng, minLat, maxLng, maxLat); err != nil {
				s.log.Warn("route red-segment lookup failed", "err", err)
			} else {
				for _, p := range redSegs {
					avoidPts = append(avoidPts, [2]float64{p.Lng, p.Lat})
				}
			}
		}
		if len(avoidPts) > 0 {
			avoid = geo.AvoidSquares(avoidPts)
		}
	}

	// For wheelchair profile, try pgRouting first — it uses our segment graph
	// with accessibility-weighted costs (full 1×, partial 1.5×, unknown 3×,
	// none 100×). Fall through to ORS when pgRouting has no path.
	if wanted == "wheelchair" && s.store != nil && len(req.Via) == 0 {
		if ar, err := s.store.RouteAccessible(r.Context(), from[0], from[1], to[0], to[1]); err == nil && ar != nil && len(ar.Coordinates) > 1 {
			httpx.JSON(w, http.StatusOK, geo.RouteResult{
				Profile:     "wheelchair",
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

	res, err := s.geo.Route(r.Context(), geo.RouteInput{
		From:         from,
		To:           to,
		Via:          req.Via,
		Profile:      wanted,
		Restrictions: rest,
		Avoid:        avoid,
	})
	if err != nil {
		if errors.Is(err, geo.ErrUnavailable) {
			httpx.Error(w, http.StatusServiceUnavailable, "unavailable", "routing is not configured")
			return
		}
		s.log.Error("route", "err", err)
		httpx.Error(w, http.StatusBadGateway, "upstream_error", "routing failed")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
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
