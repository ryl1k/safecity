package server

import (
	"context"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/safecity/api/internal/httpx"
)

// Moderation surface (/admin/*). Gated by RequireRole(moderator) at the router
// AND by the is_moderator() RLS policies inside every write — defense in depth.

// handleAdminUnverifiedPoints: GET /admin/points/unverified.
func (s *Server) handleAdminUnverifiedPoints(w http.ResponseWriter, r *http.Request) {
	res, err := s.store.UnverifiedPoints(r.Context())
	if err != nil {
		s.log.Error("admin unverified points", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load points")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

type verifyRequest struct {
	Status string `json:"status" validate:"required,oneof=unverified verified official"`
}

// handleAdminSetPointVerify: POST /admin/points/{id}/verify {status}.
func (s *Server) handleAdminSetPointVerify(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		httpx.Error(w, http.StatusBadRequest, "invalid_query", "point id must be a uuid")
		return
	}
	var req verifyRequest
	if !httpx.Decode(w, r, &req) {
		return
	}
	if err := s.store.SetPointVerify(r.Context(), p.UserID, id, req.Status); err != nil {
		s.storeError(w, "admin verify point", "", "point not found", err)
		return
	}
	s.log.Info("point verify status changed", "point_id", id, "status", req.Status, "moderator", p.UserID)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleAdminDeletePoint: DELETE /admin/points/{id}.
func (s *Server) handleAdminDeletePoint(w http.ResponseWriter, r *http.Request) {
	s.adminDelete(w, r, "point", s.store.DeletePoint)
}

// handleAdminOpenProblems: GET /admin/problems.
func (s *Server) handleAdminOpenProblems(w http.ResponseWriter, r *http.Request) {
	res, err := s.store.OpenProblems(r.Context())
	if err != nil {
		s.log.Error("admin open problems", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load problems")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// handleAdminResolveProblem: POST /admin/problems/{id}/resolve.
func (s *Server) handleAdminResolveProblem(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		httpx.Error(w, http.StatusBadRequest, "invalid_query", "problem id must be a uuid")
		return
	}
	if err := s.store.ResolveProblem(r.Context(), p.UserID, id); err != nil {
		s.storeError(w, "admin resolve problem", "", "problem not found", err)
		return
	}
	s.log.Info("problem resolved", "problem_id", id, "moderator", p.UserID)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleAdminDeleteProblem: DELETE /admin/problems/{id}.
func (s *Server) handleAdminDeleteProblem(w http.ResponseWriter, r *http.Request) {
	s.adminDelete(w, r, "problem", s.store.DeleteProblem)
}

// handleAdminRecentReviews: GET /admin/reviews?limit=.
func (s *Server) handleAdminRecentReviews(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	res, err := s.store.RecentReviews(r.Context(), limit)
	if err != nil {
		s.log.Error("admin recent reviews", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load reviews")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// handleAdminDeleteReview: DELETE /admin/reviews/{id}.
func (s *Server) handleAdminDeleteReview(w http.ResponseWriter, r *http.Request) {
	s.adminDelete(w, r, "review", s.store.DeleteReview)
}

// handleAdminListUsers: GET /admin/users?limit=.
func (s *Server) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	res, err := s.store.ListUsers(r.Context(), limit)
	if err != nil {
		s.log.Error("admin list users", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load users")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

type roleRequest struct {
	Role string `json:"role" validate:"required,oneof=user trusted moderator"`
}

// handleAdminSetUserRole: POST /admin/users/{id}/role {role}.
func (s *Server) handleAdminSetUserRole(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		httpx.Error(w, http.StatusBadRequest, "invalid_query", "user id must be a uuid")
		return
	}
	var req roleRequest
	if !httpx.Decode(w, r, &req) {
		return
	}
	if err := s.store.SetUserRole(r.Context(), p.UserID, id, req.Role); err != nil {
		s.storeError(w, "admin set role", "", "user not found", err)
		return
	}
	s.log.Info("user role changed", "user_id", id, "role", req.Role, "moderator", p.UserID)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// adminDelete factors the shared shape of the delete endpoints.
func (s *Server) adminDelete(
	w http.ResponseWriter, r *http.Request,
	entity string, del func(ctx context.Context, userID, id string) error,
) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		httpx.Error(w, http.StatusBadRequest, "invalid_query", entity+" id must be a uuid")
		return
	}
	if err := del(r.Context(), p.UserID, id); err != nil {
		s.storeError(w, "admin delete "+entity, "", entity+" not found", err)
		return
	}
	s.log.Info(entity+" deleted", "id", id, "moderator", p.UserID)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
