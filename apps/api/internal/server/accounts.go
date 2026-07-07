package server

import (
	"errors"
	"net/http"
	"strings"

	"github.com/safecity/api/internal/accounts"
	"github.com/safecity/api/internal/httpx"
)

// signupRequest is the body for POST /auth/signup. Validation is manual so the
// error messages stay user-facing Ukrainian (clients show them verbatim).
type signupRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// handleSignup: POST /auth/signup — server-side account creation through the
// Supabase admin API with email_confirm=true, so accounts are usable instantly.
// Public but rate-limited. (Hackathon-grade: add captcha before production.)
func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	var req signupRequest
	if !httpx.Decode(w, r, &req) {
		return
	}
	email := strings.TrimSpace(req.Email)
	if email == "" || req.Password == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", "Вкажіть пошту й пароль")
		return
	}
	if !strings.Contains(email, "@") {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", "Некоректна адреса пошти")
		return
	}
	if len(req.Password) < 8 {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", "Пароль має містити щонайменше 8 символів")
		return
	}

	if err := s.accounts.CreateUser(r.Context(), email, req.Password); err != nil {
		if errors.Is(err, accounts.ErrExists) {
			httpx.Error(w, http.StatusConflict, "conflict", "Користувач із такою поштою вже існує")
			return
		}
		s.log.Error("signup", "err", err)
		httpx.Error(w, http.StatusBadGateway, "upstream_error", "Не вдалося створити акаунт, спробуйте пізніше")
		return
	}
	s.log.Info("account created", "email_domain", emailDomain(email))
	httpx.JSON(w, http.StatusCreated, map[string]bool{"ok": true})
}

// emailDomain keeps signup logs useful without logging PII.
func emailDomain(email string) string {
	if i := strings.LastIndexByte(email, '@'); i >= 0 {
		return email[i+1:]
	}
	return ""
}

// profileSyncRequest is the body for POST /me/profile.
type profileSyncRequest struct {
	Needs   []string `json:"needs"`
	Primary string   `json:"primary"`
}

func validProfileNeed(v string) bool { return v == "wheelchair" || v == "blind" }

// handleProfileSync: POST /me/profile — persist the caller's accessibility
// profile (guest device settings merged into the account after sign-in).
func (s *Server) handleProfileSync(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	var req profileSyncRequest
	if !httpx.Decode(w, r, &req) {
		return
	}
	for _, n := range req.Needs {
		if !validProfileNeed(n) {
			httpx.Error(w, http.StatusBadRequest, "invalid_body", "needs must be wheelchair|blind")
			return
		}
	}
	if req.Primary != "" && !validProfileNeed(req.Primary) {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", "primary must be wheelchair|blind")
		return
	}

	if err := s.store.UpdateProfileNeeds(r.Context(), p.UserID, req.Needs, req.Primary); err != nil {
		s.storeError(w, "profile sync", "", "profile not found", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
