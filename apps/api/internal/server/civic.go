package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/safecity/api/internal/httpx"
	"github.com/safecity/api/internal/store"
)

// handleConfirmProblem: POST /problems/{id}/confirm. Idempotent per user — a
// repeat confirm is a 409 (the client treats that as "already confirmed").
func (s *Server) handleConfirmProblem(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	problemID := chi.URLParam(r, "id")
	if !isUUID(problemID) {
		httpx.Error(w, http.StatusNotFound, "not_found", "problem not found")
		return
	}

	res, err := s.store.ConfirmProblem(r.Context(), p.UserID, problemID)
	if err != nil {
		s.storeError(w, "confirm problem", "you have already confirmed this problem", "problem not found", err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// createPetitionRequest is the body for POST /petitions.
type createPetitionRequest struct {
	ProblemID   string `json:"problem_id" validate:"required,uuid"`
	Scope       string `json:"scope" validate:"omitempty,oneof=internal official"`
	Title       string `json:"title" validate:"required,min=3,max=200"`
	Body        string `json:"body" validate:"max=5000"`
	OfficialURL string `json:"official_url" validate:"omitempty,url,max=500"`
}

func (s *Server) handleCreatePetition(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	var req createPetitionRequest
	if !httpx.Decode(w, r, &req) {
		return
	}
	scope := req.Scope
	if scope == "" {
		scope = "internal"
	}

	pet, err := s.store.CreatePetition(r.Context(), p.UserID, store.NewPetition{
		ProblemID:   req.ProblemID,
		Scope:       scope,
		Title:       req.Title,
		Body:        req.Body,
		OfficialURL: req.OfficialURL,
	})
	if err != nil {
		s.storeError(w, "create petition", "", "problem not found", err)
		return
	}
	httpx.JSON(w, http.StatusCreated, pet)
}

// handleSignPetition: POST /petitions/{id}/sign. Idempotent per user → 409 on a
// repeat. Returns the live signature count.
func (s *Server) handleSignPetition(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	petitionID := chi.URLParam(r, "id")
	if !isUUID(petitionID) {
		httpx.Error(w, http.StatusNotFound, "not_found", "petition not found")
		return
	}

	res, err := s.store.SignPetition(r.Context(), p.UserID, petitionID)
	if err != nil {
		s.storeError(w, "sign petition", "you have already signed this petition", "petition not found", err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}
