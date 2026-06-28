// Package server wires the HTTP router, middleware, and route handlers.
package server

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/safecity/api/internal/auth"
	"github.com/safecity/api/internal/geo"
	"github.com/safecity/api/internal/httpx"
	"github.com/safecity/api/internal/ratelimit"
	"github.com/safecity/api/internal/store"
)

// DataStore is the subset of the data layer the handlers need. It grows as more
// paths migrate to the API; defined here (consumer side) so handlers can be
// unit-tested with a fake.
type DataStore interface {
	// reads (public)
	PointsNear(ctx context.Context, lng, lat, radiusM float64) ([]store.PointSummary, error)
	PointsInBBox(ctx context.Context, minLng, minLat, maxLng, maxLat float64) ([]store.PointSummary, error)
	PointDetail(ctx context.Context, id string) (*store.PointDetail, error)
	// contribution writes
	AddPoint(ctx context.Context, userID string, in store.NewPoint) (string, error)
	UpsertReview(ctx context.Context, userID, pointID string, in store.NewReview) (store.Review, error)
	// civic writes
	CreateProblem(ctx context.Context, userID string, in store.NewProblem) (store.Problem, error)
	ConfirmProblem(ctx context.Context, userID, problemID string) (store.ConfirmResult, error)
	CreatePetition(ctx context.Context, userID string, in store.NewPetition) (store.Petition, error)
	SignPetition(ctx context.Context, userID, petitionID string) (store.SignResult, error)
	// routing support
	BarriersInBBox(ctx context.Context, minLng, minLat, maxLng, maxLat float64) ([]store.LngLat, error)
}

// GeoService proxies routing + geocoding (ORS / Nominatim).
type GeoService interface {
	Route(ctx context.Context, in geo.RouteInput) (geo.RouteResult, error)
	Geocode(ctx context.Context, query string, limit int) ([]geo.Place, error)
}

// Deps are the dependencies wired into the server. Log is required; the rest are
// optional so tests can construct a minimal server.
type Deps struct {
	Log      *slog.Logger
	Ready    func(context.Context) error // readiness check (e.g. DB ping); nil = always ready
	Verifier *auth.Verifier              // JWT verifier; nil disables auth (public routes only)
	Roles    auth.RoleResolver           // resolves application role for RequireRole
	Limiter  *ratelimit.Limiter          // throttles writes/proxies; nil disables limiting
	Store    DataStore                   // data access; nil disables data routes
	Geo      GeoService                  // routing/geocoding proxy; nil disables proxy routes
}

// Server holds the router and dependencies shared by handlers.
type Server struct {
	router   chi.Router
	log      *slog.Logger
	ready    func(context.Context) error
	verifier *auth.Verifier
	roles    auth.RoleResolver
	limiter  *ratelimit.Limiter
	store    DataStore
	geo      GeoService
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

	s := &Server{router: r, log: d.Log, ready: d.Ready, verifier: d.Verifier, roles: d.Roles, limiter: d.Limiter, store: d.Store, geo: d.Geo}
	s.routes()
	return s
}

// Handler exposes the router as an http.Handler.
func (s *Server) Handler() http.Handler { return s.router }

func (s *Server) routes() {
	// Probes are unauthenticated and unthrottled (orchestrators poll them often).
	s.router.Get("/healthz", s.handleHealth)
	s.router.Get("/readyz", s.handleReady)

	if s.store != nil {
		// /points mixes public reads with authenticated writes. chi mounts a
		// subrouter for the prefix, so every /points route lives inside it.
		s.router.Route("/points", func(r chi.Router) {
			r.Get("/near", s.handlePointsNear)
			r.Get("/bbox", s.handlePointsBBox)
			r.Get("/{id}", s.handlePointDetail)
			r.Group(func(r chi.Router) {
				s.authed(r)
				r.Post("/", s.handleAddPoint)
				r.Post("/{id}/reviews", s.handleAddReview)
			})
		})
	}

	// Public, rate-limited proxy surface (guests route + geocode).
	if s.geo != nil {
		s.router.Group(func(r chi.Router) {
			s.limited(r)
			r.Post("/route", s.handleRoute)
			r.Get("/geocode", s.handleGeocode)
		})
	}

	// Authenticated, rate-limited surface.
	s.router.Group(func(r chi.Router) {
		s.authed(r)
		r.Get("/me", s.handleMe)
		if s.store != nil {
			r.Post("/problems", s.handleCreateProblem)
			r.Post("/problems/{id}/confirm", s.handleConfirmProblem)
			r.Post("/petitions", s.handleCreatePetition)
			r.Post("/petitions/{id}/sign", s.handleSignPetition)
		}
	})
}

// limited applies the rate-limit middleware to a route group (if configured).
func (s *Server) limited(r chi.Router) {
	if s.limiter != nil {
		r.Use(s.limiter.Middleware(s.rateKey))
	}
}

// authed applies auth + rate-limit middleware to a route group.
func (s *Server) authed(r chi.Router) {
	r.Use(auth.RequireUser)
	s.limited(r)
}

// storeError maps store sentinel errors to HTTP responses. conflictMsg/notFoundMsg
// tailor the 409/404 text; everything else is a 500 logged under op.
func (s *Server) storeError(w http.ResponseWriter, op, conflictMsg, notFoundMsg string, err error) {
	switch {
	case errors.Is(err, store.ErrConflict):
		httpx.Error(w, http.StatusConflict, "conflict", conflictMsg)
	case errors.Is(err, store.ErrNotFound):
		httpx.Error(w, http.StatusNotFound, "not_found", notFoundMsg)
	case errors.Is(err, store.ErrInvalid):
		httpx.Error(w, http.StatusUnprocessableEntity, "invalid", "a value was rejected by a database constraint")
	default:
		s.log.Error(op, "err", err)
		httpx.Error(w, http.StatusInternalServerError, "internal", "internal error")
	}
}

// principal pulls the authenticated caller from context (RequireUser guarantees
// it; this stays defensive and 401s otherwise).
func (s *Server) principal(w http.ResponseWriter, r *http.Request) (*auth.Principal, bool) {
	p, ok := auth.PrincipalFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return nil, false
	}
	return p, true
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

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func isUUID(s string) bool { return uuidRe.MatchString(s) }

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
