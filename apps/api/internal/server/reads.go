package server

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/safecity/api/internal/httpx"
	"github.com/safecity/api/internal/store"
)

// Catalog data changes ~never at runtime; let clients hold it for an hour.
const catalogCacheControl = "public, max-age=3600, stale-while-revalidate=86400"

// handlePointsSearch: GET /points/search?q=&limit= — public name/address search.
func (s *Server) handlePointsSearch(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(q)) < 2 {
		httpx.JSON(w, http.StatusOK, []store.PointHit{})
		return
	}
	limit := 6
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 20 {
			limit = n
		}
	}
	res, err := s.store.SearchPoints(r.Context(), q, limit)
	if err != nil {
		s.log.Error("points search", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not search points")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// handlePointReviews: GET /points/{id}/reviews — public, newest first.
func (s *Server) handlePointReviews(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		httpx.Error(w, http.StatusBadRequest, "invalid_query", "point id must be a uuid")
		return
	}
	res, err := s.store.ReviewsFor(r.Context(), id)
	if err != nil {
		s.log.Error("point reviews", "err", err, "id", id)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load reviews")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// handleReviewStats: GET /reviews/stats — per-point average stars + count,
// aggregated in SQL.
func (s *Server) handleReviewStats(w http.ResponseWriter, r *http.Request) {
	res, err := s.store.ReviewStats(r.Context())
	if err != nil {
		s.log.Error("review stats", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load review stats")
		return
	}
	w.Header().Set("Cache-Control", readCacheControl)
	httpx.JSON(w, http.StatusOK, res)
}

// handleListProblems: GET /problems — public, most-confirmed first.
func (s *Server) handleListProblems(w http.ResponseWriter, r *http.Request) {
	res, err := s.store.ListProblems(r.Context())
	if err != nil {
		s.log.Error("list problems", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load problems")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// handleProblemsBBox: GET /problems/bbox?min_lng=&min_lat=&max_lng=&max_lat= —
// public map layer of located problems.
func (s *Server) handleProblemsBBox(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	minLng, ok1 := floatQuery(q.Get("min_lng"))
	minLat, ok2 := floatQuery(q.Get("min_lat"))
	maxLng, ok3 := floatQuery(q.Get("max_lng"))
	maxLat, ok4 := floatQuery(q.Get("max_lat"))
	if !ok1 || !ok2 || !ok3 || !ok4 ||
		!validLngLat(minLng, minLat) || !validLngLat(maxLng, maxLat) {
		httpx.Error(w, http.StatusBadRequest, "invalid_query", "min_lng, min_lat, max_lng, max_lat are required numbers in range")
		return
	}
	res, err := s.store.ProblemsInBBox(r.Context(), minLng, minLat, maxLng, maxLat)
	if err != nil {
		s.log.Error("problems bbox", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load problems")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// handleProblemDetail: GET /problems/{id} — public; problem + petition (if any).
func (s *Server) handleProblemDetail(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		httpx.Error(w, http.StatusBadRequest, "invalid_query", "problem id must be a uuid")
		return
	}
	res, err := s.store.ProblemByID(r.Context(), id)
	if err != nil {
		s.log.Error("problem detail", "err", err, "id", id)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load problem")
		return
	}
	if res == nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "problem not found")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// handleFeatureCatalog: GET /catalog/features — the accessibility feature
// catalog (small, effectively static).
func (s *Server) handleFeatureCatalog(w http.ResponseWriter, r *http.Request) {
	res, err := s.store.FeatureCatalog(r.Context())
	if err != nil {
		s.log.Error("feature catalog", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load catalog")
		return
	}
	w.Header().Set("Cache-Control", catalogCacheControl)
	httpx.JSON(w, http.StatusOK, res)
}
