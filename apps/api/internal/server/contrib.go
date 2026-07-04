package server

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/safecity/api/internal/httpx"
	"github.com/safecity/api/internal/store"
)

// createPointRequest is the body for POST /points. Photos are Storage URLs the
// client uploaded directly; the API only records them.
type createPointRequest struct {
	Name        string            `json:"name" validate:"required,min=2,max=200"`
	Category    string            `json:"category" validate:"required,oneof=venue transit crossing toilet parking"`
	Lat         *float64          `json:"lat" validate:"required,latitude"`
	Lng         *float64          `json:"lng" validate:"required,longitude"`
	Address     string            `json:"address" validate:"max=300"`
	Description string            `json:"description" validate:"max=2000"`
	Features    map[string]string `json:"features" validate:"omitempty,dive,oneof=yes no unknown"`
	Photos      []string          `json:"photos" validate:"omitempty,max=10,dive,url"`
}

func (s *Server) handleAddPoint(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	var req createPointRequest
	if !httpx.Decode(w, r, &req) {
		return
	}

	id, err := s.store.AddPoint(r.Context(), p.UserID, store.NewPoint{
		Name:        req.Name,
		Category:    req.Category,
		Lng:         *req.Lng,
		Lat:         *req.Lat,
		Address:     req.Address,
		Description: req.Description,
		Features:    req.Features,
		Photos:      req.Photos,
	})
	if err != nil {
		// Non-business users are capped at 10 points; the 11th is rejected here.
		// Surfaced with a distinct code so the web shows a toast (the limit is
		// never advertised before it is hit).
		if errors.Is(err, store.ErrPointLimit) {
			httpx.Error(w, http.StatusConflict, "point_limit", "point limit reached")
			return
		}
		// An unknown feature key fails the FK inside add_point — that's bad input,
		// not a missing resource, so report it as a field error.
		if errors.Is(err, store.ErrNotFound) {
			httpx.ValidationError(w, []httpx.FieldError{{Field: "features", Message: "contains an unknown feature key"}})
			return
		}
		s.storeError(w, "add point", "", "", err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"id": id})
}

// handleUpdatePoint: PATCH /points/{id} — the owner edits their own point.
func (s *Server) handleUpdatePoint(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		httpx.Error(w, http.StatusNotFound, "not_found", "point not found")
		return
	}
	var req createPointRequest
	if !httpx.Decode(w, r, &req) {
		return
	}
	err := s.store.UpdatePoint(r.Context(), p.UserID, id, store.NewPoint{
		Name: req.Name, Category: req.Category, Lng: *req.Lng, Lat: *req.Lat,
		Address: req.Address, Description: req.Description, Features: req.Features,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "point not found or not yours")
			return
		}
		if errors.Is(err, store.ErrInvalid) {
			httpx.ValidationError(w, []httpx.FieldError{{Field: "features", Message: "contains an unknown feature key"}})
			return
		}
		s.storeError(w, "update point", "", "", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleDeletePoint: DELETE /points/{id} — the owner removes their own point.
func (s *Server) handleDeletePoint(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		httpx.Error(w, http.StatusNotFound, "not_found", "point not found")
		return
	}
	if err := s.store.DeleteOwnPoint(r.Context(), p.UserID, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "point not found or not yours")
			return
		}
		s.storeError(w, "delete point", "", "", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// createReviewRequest is the body for POST /points/{id}/reviews.
type createReviewRequest struct {
	Profile string   `json:"profile" validate:"required,oneof=wheelchair blind"`
	Stars   int      `json:"stars" validate:"required,gte=1,lte=5"`
	Text    string   `json:"text" validate:"max=2000"`
	Photos  []string `json:"photos" validate:"omitempty,max=10,dive,url"`
}

func (s *Server) handleAddReview(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	pointID := chi.URLParam(r, "id")
	if !isUUID(pointID) {
		httpx.Error(w, http.StatusNotFound, "not_found", "point not found")
		return
	}
	var req createReviewRequest
	if !httpx.Decode(w, r, &req) {
		return
	}

	rv, err := s.store.UpsertReview(r.Context(), p.UserID, pointID, store.NewReview{
		Profile: req.Profile,
		Stars:   req.Stars,
		Text:    req.Text,
		Photos:  req.Photos,
	})
	if err != nil {
		s.storeError(w, "upsert review", "", "point not found", err)
		return
	}
	httpx.JSON(w, http.StatusOK, rv)
}
