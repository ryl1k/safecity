package server

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/safecity/api/internal/httpx"
	"github.com/safecity/api/internal/store"
)

// Business listings (/business/points/*) — self-serve, no moderator approval
// gate (same authenticated group as /points writes). Payments are mocked:
// verify-payment and subscribe flip database flags directly with no processor
// involved. See the owner_update policy comment in 0017_business_listings.sql —
// when a real payment gateway is wired in, these two endpoints must move behind
// a payment-webhook handler instead.

// handleCreateBusinessPoint: POST /business/points — body identical to POST
// /points; adds a business_listings row for the new point in the same tx.
func (s *Server) handleCreateBusinessPoint(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	var req createPointRequest
	if !httpx.Decode(w, r, &req) {
		return
	}

	id, err := s.store.CreateBusinessPoint(r.Context(), p.UserID, store.NewPoint{
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
		// An unknown feature key fails the FK inside add_point — that's bad input,
		// not a missing resource, so report it as a field error.
		if errors.Is(err, store.ErrNotFound) {
			httpx.ValidationError(w, []httpx.FieldError{{Field: "features", Message: "contains an unknown feature key"}})
			return
		}
		s.storeError(w, "create business point", "", "", err)
		return
	}
	s.log.Info("business point created", "point_id", id, "owner", p.UserID)
	httpx.JSON(w, http.StatusCreated, map[string]string{"id": id})
}

// handleMyBusinessPoints: GET /business/points/me — the caller's business
// points with their verify/subscription state, for the dashboard.
func (s *Server) handleMyBusinessPoints(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	res, err := s.store.MyBusinessPoints(r.Context(), p.UserID)
	if err != nil {
		s.log.Error("my business points", "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "could not load business points")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

// handleVerifyBusinessPayment: POST /business/points/{id}/verify-payment.
// MOCK — flips verified_paid with no payment processor behind it.
func (s *Server) handleVerifyBusinessPayment(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		httpx.Error(w, http.StatusNotFound, "not_found", "business point not found")
		return
	}
	if err := s.store.MarkVerifiedPaid(r.Context(), p.UserID, id); err != nil {
		s.storeError(w, "verify business payment", "", "business point not found", err)
		return
	}
	s.log.Info("business point verified (mock payment)", "point_id", id, "owner", p.UserID)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// subscribeRequest is the body for POST /business/points/{id}/subscribe.
type subscribeRequest struct {
	Plan string `json:"plan" validate:"required,oneof=monthly yearly"`
}

// handleSubscribeBusinessPoint: POST /business/points/{id}/subscribe {plan}.
// MOCK — flips subscription_status to active with no payment processor behind it.
func (s *Server) handleSubscribeBusinessPoint(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if !isUUID(id) {
		httpx.Error(w, http.StatusNotFound, "not_found", "business point not found")
		return
	}
	var req subscribeRequest
	if !httpx.Decode(w, r, &req) {
		return
	}
	if err := s.store.SetSubscription(r.Context(), p.UserID, id, req.Plan); err != nil {
		s.storeError(w, "subscribe business point", "", "business point not found", err)
		return
	}
	s.log.Info("business point subscription changed", "point_id", id, "owner", p.UserID, "plan", req.Plan)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
