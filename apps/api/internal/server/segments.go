package server

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/safecity/api/internal/groq"
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
	Photos           []string     `json:"photos"`
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
	if len(req.Photos) == 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", "at least one photo is required")
		return
	}
	var aiReason string
	if s.groq != nil {
		claim := segmentClaim(req)
		verdict, err := s.groq.ValidatePhoto(r.Context(), req.Photos[0], claim)
		if err != nil {
			s.log.Warn("groq validation error", "err", err)
		} else if verdict.Verdict == groq.VerdictReject {
			httpx.Error(w, http.StatusUnprocessableEntity, "photo_rejected", verdict.Reason)
			return
		} else {
			aiReason = verdict.Reason
		}
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
		Photos:           req.Photos,
		AIReason:         aiReason,
	}
	id, err := s.store.AddSegment(r.Context(), p.UserID, in)
	if err != nil {
		s.log.Error("add segment", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not save segment")
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"id": id, "ai_reason": aiReason})
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

// segmentClaim builds a natural-language description of a pathway submission.
func segmentClaim(req addSegmentRequest) string {
	parts := []string{"Type: pedestrian sidewalk or pathway"}
	if req.StreetName != "" {
		parts = append(parts, fmt.Sprintf("Street: %s", req.StreetName))
	}
	if req.SurfaceType != "" {
		parts = append(parts, fmt.Sprintf("Surface: %s", req.SurfaceType))
	}
	var feats []string
	if req.IsStepFree != nil && *req.IsStepFree {
		feats = append(feats, "step-free")
	}
	if req.HasTactilePaving != nil && *req.HasTactilePaving {
		feats = append(feats, "tactile paving")
	}
	if req.HasCurbCuts != nil && *req.HasCurbCuts {
		feats = append(feats, "curb cuts")
	}
	if req.HasRamp != nil && *req.HasRamp {
		feats = append(feats, "ramp")
	}
	if req.Lit != nil && *req.Lit {
		feats = append(feats, "lit")
	}
	if len(feats) > 0 {
		parts = append(parts, "Features: "+strings.Join(feats, ", "))
	}
	return strings.Join(parts, ". ")
}
