package server

import (
	"context"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/safecity/api/internal/httpx"
)

const (
	defaultRadiusM = 1500
	maxRadiusM     = 50000
	// Public point reads change infrequently — let browsers/CDN cache identical
	// GETs so repeated map views don't re-hit the DB. Short window keeps it fresh.
	readCacheControl = "public, max-age=60, stale-while-revalidate=120"
)

// handlePointsNear: GET /points/near?lng=&lat=&radius= — public map read.
func (s *Server) handlePointsNear(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	lng, okLng := floatQuery(q.Get("lng"))
	lat, okLat := floatQuery(q.Get("lat"))
	if !okLng || !okLat {
		httpx.Error(w, http.StatusBadRequest, "invalid_query", "lng and lat are required numbers")
		return
	}
	if !validLngLat(lng, lat) {
		httpx.Error(w, http.StatusBadRequest, "invalid_query", "lng/lat out of range")
		return
	}
	radius := float64(defaultRadiusM)
	if v := q.Get("radius"); v != "" {
		f, ok := floatQuery(v)
		if !ok || f <= 0 || f > maxRadiusM {
			httpx.Error(w, http.StatusBadRequest, "invalid_query", "radius must be a number in (0, 50000]")
			return
		}
		radius = f
	}

	res, err := s.store.PointsNear(r.Context(), lng, lat, radius)
	if err != nil {
		s.log.Error("points near", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load points")
		return
	}
	w.Header().Set("Cache-Control", readCacheControl)
	httpx.JSON(w, http.StatusOK, res)
}

// handlePointsBBox: GET /points/bbox?min_lng=&min_lat=&max_lng=&max_lat= — public.
func (s *Server) handlePointsBBox(w http.ResponseWriter, r *http.Request) {
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

	res, err := s.store.PointsInBBox(r.Context(), minLng, minLat, maxLng, maxLat)
	if err != nil {
		s.log.Error("points bbox", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load points")
		return
	}
	w.Header().Set("Cache-Control", readCacheControl)
	httpx.JSON(w, http.StatusOK, res)
}

// handlePointDetail: GET /points/{id} — public; 404 when not found.
func (s *Server) handlePointDetail(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		httpx.Error(w, http.StatusNotFound, "not_found", "point not found")
		return
	}
	p, err := s.store.PointDetail(r.Context(), id)
	if err != nil {
		s.log.Error("point detail", "err", err, "id", id)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load point")
		return
	}
	if p == nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "point not found")
		return
	}
	// Best-effort view analytics — don't block or fail the read on it.
	go s.store.IncrementView(context.Background(), id)
	w.Header().Set("Cache-Control", readCacheControl)
	httpx.JSON(w, http.StatusOK, p)
}

func floatQuery(v string) (float64, bool) {
	if v == "" {
		return 0, false
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0, false
	}
	return f, true
}

func validLngLat(lng, lat float64) bool {
	return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
}
