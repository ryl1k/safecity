package server

import (
	"errors"
	"math"
	"net/http"
	"strconv"

	"github.com/safecity/api/internal/geo"
	"github.com/safecity/api/internal/httpx"
)

// routeRequest is the body for POST /route. from/to are [lng,lat]. The avoid
// polygons are built server-side from confirmed problems, so the client only
// sends endpoints + profile.
type routeRequest struct {
	From    *[2]float64  `json:"from" validate:"required"`
	To      *[2]float64  `json:"to" validate:"required"`
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

	// Build avoidance polygons from confirmed/escalated problems in the corridor.
	// Best-effort: a barrier-lookup failure must not block routing.
	var avoid [][][][]float64
	if s.store != nil {
		minLng, maxLng := math.Min(from[0], to[0])-avoidPad, math.Max(from[0], to[0])+avoidPad
		minLat, maxLat := math.Min(from[1], to[1])-avoidPad, math.Max(from[1], to[1])+avoidPad
		if barriers, err := s.store.BarriersInBBox(r.Context(), minLng, minLat, maxLng, maxLat); err != nil {
			s.log.Warn("route barrier lookup failed", "err", err)
		} else if len(barriers) > 0 {
			pts := make([][2]float64, len(barriers))
			for i, b := range barriers {
				pts[i] = [2]float64{b.Lng, b.Lat}
			}
			avoid = geo.AvoidSquares(pts)
		}
	}

	res, err := s.geo.Route(r.Context(), geo.RouteInput{
		From:         from,
		To:           to,
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
