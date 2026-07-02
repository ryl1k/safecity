package server

import (
	"net/http"

	"github.com/safecity/api/internal/httpx"
)

// handleTransitPlan: GET /transit/plan?from_lng=&from_lat=&to_lng=&to_lat= —
// public-transport journey options with accessibility ranking. All business
// logic (route accessibility, categories, sorting) lives in internal/transit;
// clients only render the result.
func (s *Server) handleTransitPlan(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	fromLng, ok1 := floatQuery(q.Get("from_lng"))
	fromLat, ok2 := floatQuery(q.Get("from_lat"))
	toLng, ok3 := floatQuery(q.Get("to_lng"))
	toLat, ok4 := floatQuery(q.Get("to_lat"))
	if !ok1 || !ok2 || !ok3 || !ok4 ||
		!validLngLat(fromLng, fromLat) || !validLngLat(toLng, toLat) {
		httpx.Error(w, http.StatusBadRequest, "invalid_query",
			"from_lng, from_lat, to_lng, to_lat are required numbers in range")
		return
	}

	res, err := s.transit.Plan(r.Context(), [2]float64{fromLng, fromLat}, [2]float64{toLng, toLat})
	if err != nil {
		s.log.Error("transit plan", "err", err)
		httpx.Error(w, http.StatusBadGateway, "upstream_error", "transit planning failed")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}
