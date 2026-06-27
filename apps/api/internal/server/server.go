// Package server wires the HTTP router, middleware, and route handlers.
package server

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/safecity/api/internal/auth"
	"github.com/safecity/api/internal/httpx"
	"github.com/safecity/api/internal/ratelimit"
)

// Deps are the dependencies wired into the server. Log is required; the rest are
// optional so tests can construct a minimal server.
type Deps struct {
	Log      *slog.Logger
	Ready    func(context.Context) error // readiness check (e.g. DB ping); nil = always ready
	Verifier *auth.Verifier              // JWT verifier; nil disables auth (public routes only)
	Roles    auth.RoleResolver           // resolves application role for RequireRole
	Limiter  *ratelimit.Limiter          // throttles writes/proxies; nil disables limiting
}

// Server holds the router and dependencies shared by handlers.
type Server struct {
	router   chi.Router
	log      *slog.Logger
	ready    func(context.Context) error
	verifier *auth.Verifier
	roles    auth.RoleResolver
	limiter  *ratelimit.Limiter
}

// New builds a Server with base middleware and routes registered.
func New(d Deps) *Server {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(requestLogger(d.Log))
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	if d.Verifier != nil {
		// Guest-friendly: attaches a principal when a valid bearer is present,
		// rejects an invalid one, and lets anonymous reads through.
		r.Use(auth.Authenticate(d.Verifier))
	}

	s := &Server{router: r, log: d.Log, ready: d.Ready, verifier: d.Verifier, roles: d.Roles, limiter: d.Limiter}
	s.routes()
	return s
}

// Handler exposes the router as an http.Handler.
func (s *Server) Handler() http.Handler { return s.router }

func (s *Server) routes() {
	// Probes are unauthenticated and unthrottled (orchestrators poll them often).
	s.router.Get("/healthz", s.handleHealth)
	s.router.Get("/readyz", s.handleReady)

	// Authenticated surface — writes and the like get rate limited.
	s.router.Group(func(r chi.Router) {
		r.Use(auth.RequireUser)
		if s.limiter != nil {
			r.Use(s.limiter.Middleware(s.rateKey))
		}
		r.Get("/me", s.handleMe)
	})
}

// rateKey throttles per authenticated user when known, else per client IP.
func (s *Server) rateKey(r *http.Request) string {
	if p, ok := auth.PrincipalFrom(r.Context()); ok {
		return "user:" + p.UserID
	}
	return "ip:" + clientIP(r)
}

func clientIP(r *http.Request) string {
	// chi's RealIP middleware has already normalized RemoteAddr from proxy headers.
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// handleMe returns the caller's identity (and application role, if resolvable).
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.PrincipalFrom(r.Context())
	if !ok { // RequireUser guarantees this, but stay defensive.
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	resp := map[string]any{"user_id": p.UserID, "email": p.Email}
	if s.roles != nil {
		if role, err := s.roles(r.Context(), p.UserID); err == nil {
			resp["role"] = role
		}
	}
	httpx.JSON(w, http.StatusOK, resp)
}

// handleHealth is a liveness probe — the process is up.
func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleReady is a readiness probe — runs the readiness check (DB ping) if set.
func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	if s.ready != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		if err := s.ready(ctx); err != nil {
			httpx.JSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
			return
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func requestLogger(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			log.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", ww.Status(),
				"bytes", ww.BytesWritten(),
				"dur_ms", time.Since(start).Milliseconds(),
				"req_id", middleware.GetReqID(r.Context()),
			)
		})
	}
}
