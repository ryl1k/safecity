package server

import (
	"net/http"

	"github.com/safecity/api/internal/httpx"
	"github.com/safecity/api/internal/store"
)

type addSegmentRequest struct {
	StreetName       string       `json:"streetName"`
	Coords           [][2]float64 `json:"coords"`
	SidewalkWidthM   *float64     `json:"sidewalkWidthM"`
	SurfaceType      string       `json:"surfaceType"`
	InclinePercent   *float64     `json:"inclinePercent"`
	HasTactilePaving *bool        `json:"hasTactilePaving"`
	IsStepFree       *bool        `json:"isStepFree"`
	HasCurbCuts      *bool        `json:"hasCurbCuts"`
	HasRamp          *bool        `json:"hasRamp"`
	Lit              *bool        `json:"lit"`
}

// handleAddSegment: POST /segments — authenticated.
func (s *Server) handleAddSegment(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	var req addSegmentRequest
	if !httpx.Decode(w, r, &req) {
		return
	}
	if req.StreetName == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", "streetName is required")
		return
	}
	if len(req.Coords) < 2 {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", "at least 2 coordinate pairs are required")
		return
	}
	in := store.NewSegment{
		StreetName:       req.StreetName,
		Coords:           req.Coords,
		SidewalkWidthM:   req.SidewalkWidthM,
		SurfaceType:      req.SurfaceType,
		InclinePercent:   req.InclinePercent,
		HasTactilePaving: req.HasTactilePaving,
		IsStepFree:       req.IsStepFree,
		HasCurbCuts:      req.HasCurbCuts,
		HasRamp:          req.HasRamp,
		Lit:              req.Lit,
	}
	id, err := s.store.AddSegment(r.Context(), p.UserID, in)
	if err != nil {
		s.log.Error("add segment", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not save segment")
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"id": id})
}

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
