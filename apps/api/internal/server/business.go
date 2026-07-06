package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/safecity/api/internal/httpx"
)

// Account-level B2B (/business/*). A user becomes a "business" (unlimited points +
// verified/priority perks on all their points) by subscribing. Self-serve, same
// authenticated group as /points writes. Payments are MOCKED: subscribe flips the
// account flag directly with no processor — a real gateway must move this behind a
// payment-webhook handler.

// subscribeRequest is the body for POST /business/subscribe.
type subscribeRequest struct {
	Plan string `json:"plan" validate:"required,oneof=monthly yearly"`
}

// handleSubscribeBusiness: POST /business/subscribe {plan} — mock-activates the
// caller's account-level business subscription.
func (s *Server) handleSubscribeBusiness(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	var req subscribeRequest
	if !httpx.Decode(w, r, &req) {
		return
	}
	if err := s.store.SubscribeBusiness(r.Context(), p.UserID, req.Plan); err != nil {
		s.storeError(w, "subscribe business", "", "", err)
		return
	}
	s.log.Info("business subscription activated (mock)", "user", p.UserID, "plan", req.Plan)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleBusinessMe: GET /business/me — the caller's business status + the points
// they created (their dashboard).
func (s *Server) handleBusinessMe(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	me, err := s.store.GetBusinessMe(r.Context(), p.UserID)
	if err != nil {
		s.log.Error("business me", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load business account")
		return
	}
	httpx.JSON(w, http.StatusOK, me)
}

// handleBusinessReports: GET /business/reports — visitor-submitted problem reports
// on the caller's own points (an inbox of issues to fix).
func (s *Server) handleBusinessReports(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	reports, err := s.store.GetBusinessReports(r.Context(), p.UserID)
	if err != nil {
		s.log.Error("business reports", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load reports")
		return
	}
	httpx.JSON(w, http.StatusOK, reports)
}

// handleRequestPointVerification: POST /business/points/{id}/request-verification —
// the point's owner asks a moderator to verify it. The moderator then approves via
// POST /admin/points/{id}/verify. 404 if the point isn't the caller's.
func (s *Server) handleRequestPointVerification(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		httpx.Error(w, http.StatusBadRequest, "invalid_query", "point id must be a uuid")
		return
	}
	if err := s.store.RequestPointVerification(r.Context(), p.UserID, id); err != nil {
		s.storeError(w, "request point verification", "", "point not found", err)
		return
	}
	s.log.Info("point verification requested", "point_id", id, "user", p.UserID)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleBusinessAnalytics: GET /business/analytics — reviews-over-time (real) and
// forward-only view/search snapshots for the caller's points.
func (s *Server) handleBusinessAnalytics(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	a, err := s.store.GetBusinessAnalytics(r.Context(), p.UserID)
	if err != nil {
		s.log.Error("business analytics", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load analytics")
		return
	}
	httpx.JSON(w, http.StatusOK, a)
}
