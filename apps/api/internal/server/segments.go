package server

import (
	"net/http"

	"github.com/safecity/api/internal/httpx"
)

// handleSegmentsBBox: GET /segments/bbox?min_lng=&min_lat=&max_lng=&max_lat= — public.
func (s *Server) handleSegmentsBBox(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	minLng, ok1 := floatQuery(q.Get("min_lng"))
	minLat, ok2 := floatQuery(q.Get("min_lat"))
	maxLng, ok3 := floatQuery(q.Get("max_lng"))
	maxLat, ok4 := floatQuery(q.Get("max_lat"))
	if !ok1 || !ok2 || !ok3 || !ok4 {
		httpx.Error(w, http.StatusBadRequest, "invalid_query", "min_lng, min_lat, max_lng, max_lat are required numbers")
		return
	}
	if !validLngLat(minLng, minLat) || !validLngLat(maxLng, maxLat) {
		httpx.Error(w, http.StatusBadRequest, "invalid_query", "bbox coordinates out of range")
		return
	}

	res, err := s.store.SegmentsInBBox(r.Context(), minLng, minLat, maxLng, maxLat)
	if err != nil {
		s.log.Error("segments bbox", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load segments")
		return
	}
	w.Header().Set("Cache-Control", readCacheControl)
	httpx.JSON(w, http.StatusOK, res)
}
