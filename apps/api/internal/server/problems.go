package server

import (
	"net/http"

	"github.com/safecity/api/internal/auth"
	"github.com/safecity/api/internal/httpx"
	"github.com/safecity/api/internal/store"
)

// createProblemRequest is the validated body for POST /problems. A report must
// attach to an existing point (point_id) or carry a dropped-pin location
// (lat+lng) — enforced below and by the table CHECK.
type createProblemRequest struct {
	Title       string   `json:"title" validate:"required,min=3,max=200"`
	Description string   `json:"description" validate:"max=2000"`
	Category    string   `json:"category" validate:"omitempty,oneof=venue transit crossing toilet parking"`
	Severity    int      `json:"severity" validate:"omitempty,gte=1,lte=3"`
	PointID     string   `json:"point_id" validate:"omitempty,uuid"`
	Lat         *float64 `json:"lat" validate:"omitempty,latitude"`
	Lng         *float64 `json:"lng" validate:"omitempty,longitude"`
}

// handleCreateProblem: client → auth (RequireUser) → validate → RLS-claims tx →
// Postgres → 201. This is the vertical-slice checkpoint for the architecture.
func (s *Server) handleCreateProblem(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.PrincipalFrom(r.Context())
	if !ok { // RequireUser guarantees this; stay defensive.
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	var req createProblemRequest
	if !httpx.Decode(w, r, &req) {
		return
	}

	// Cross-field rule the struct tags can't express: point_id OR a full pin.
	hasPin := req.Lat != nil && req.Lng != nil
	if req.PointID == "" && !hasPin {
		httpx.ValidationError(w, []httpx.FieldError{{
			Field:   "point_id",
			Message: "provide point_id, or both lat and lng for a dropped pin",
		}})
		return
	}
	if req.Severity == 0 {
		req.Severity = 1
	}

	created, err := s.store.CreateProblem(r.Context(), p.UserID, store.NewProblem{
		Title:       req.Title,
		Description: req.Description,
		Category:    req.Category,
		Severity:    req.Severity,
		PointID:     req.PointID,
		Lat:         req.Lat,
		Lng:         req.Lng,
	})
	if err != nil {
		s.log.Error("create problem", "err", err, "user", p.UserID)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not create problem")
		return
	}
	httpx.JSON(w, http.StatusCreated, created)
}
