// Package server wires the HTTP router, middleware, and route handlers.
package server

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"runtime/debug"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/safecity/api/internal/auth"
	"github.com/safecity/api/internal/geo"
	"github.com/safecity/api/internal/httpx"
	"github.com/safecity/api/internal/metrics"
	"github.com/safecity/api/internal/ratelimit"
	"github.com/safecity/api/internal/store"
	"github.com/safecity/api/internal/transit"
)

// DataStore is the subset of the data layer the handlers need. It grows as more
// paths migrate to the API; defined here (consumer side) so handlers can be
// unit-tested with a fake.
type DataStore interface {
	// reads (public)
	PointsNear(ctx context.Context, lng, lat, radiusM float64) ([]store.PointSummary, error)
	PointsInBBox(ctx context.Context, minLng, minLat, maxLng, maxLat float64) ([]store.PointSummary, error)
	PointDetail(ctx context.Context, id string) (*store.PointDetail, error)
	SearchPoints(ctx context.Context, query string, limit int) ([]store.PointHit, error)
	ReviewsFor(ctx context.Context, pointID string) ([]store.Review, error)
	ReviewStats(ctx context.Context) ([]store.ReviewStat, error)
	ListProblems(ctx context.Context) ([]store.ProblemListItem, error)
	ProblemsInBBox(ctx context.Context, minLng, minLat, maxLng, maxLat float64) ([]store.ProblemMarker, error)
	ProblemByID(ctx context.Context, id string) (*store.ProblemDetail, error)
	FeatureCatalog(ctx context.Context) ([]store.Feature, error)
	// contribution writes
	AddPoint(ctx context.Context, userID string, in store.NewPoint) (string, error)
	UpsertReview(ctx context.Context, userID, pointID string, in store.NewReview) (store.Review, error)
	// civic writes
	CreateProblem(ctx context.Context, userID string, in store.NewProblem) (store.Problem, error)
	ConfirmProblem(ctx context.Context, userID, problemID string) (store.ConfirmResult, error)
	CreatePetition(ctx context.Context, userID string, in store.NewPetition) (store.Petition, error)
	SignPetition(ctx context.Context, userID, petitionID string) (store.SignResult, error)
	// account profile
	UpdateProfileNeeds(ctx context.Context, userID string, needs []string, primary string) error
	// routing support
	BarriersInBBox(ctx context.Context, minLng, minLat, maxLng, maxLat float64) ([]store.LngLat, error)
}

// GeoService proxies routing + geocoding (ORS / Nominatim).
type GeoService interface {
	Route(ctx context.Context, in geo.RouteInput) (geo.RouteResult, error)
	Geocode(ctx context.Context, query string, limit int) ([]geo.Place, error)
	Reverse(ctx context.Context, lng, lat float64) (*geo.Place, error)
}

// TransitService plans public-transport journeys (Transitous/MOTIS).
type TransitService interface {
	Plan(ctx context.Context, from, to [2]float64) (transit.Result, error)
}

// AccountService performs server-side account operations (Supabase admin API).
type AccountService interface {
	CreateUser(ctx context.Context, email, password string) error
}

// Deps are the dependencies wired into the server. Log is required; the rest are
// optional so tests can construct a minimal server.
type Deps struct {
	Log         *slog.Logger
	Ready       func(context.Context) error // readiness check (e.g. DB ping); nil = always ready
	Verifier    *auth.Verifier              // JWT verifier; nil disables auth (public routes only)
	Roles       auth.RoleResolver           // resolves application role for RequireRole
	Limiter     *ratelimit.Limiter          // throttles writes/proxies; nil disables limiting
	Store       DataStore                   // data access; nil disables data routes
	Geo         GeoService                  // routing/geocoding proxy; nil disables proxy routes
	Transit     TransitService              // public-transport planning; nil disables /transit
	Accounts    AccountService              // server-side signup; nil disables /auth/signup
	Metrics     *metrics.Metrics            // Prometheus hook; nil disables /metrics
	CORSOrigins []string                    // allowed browser origins; empty disables CORS
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
	transit  TransitService
	accounts AccountService
	metrics  *metrics.Metrics
}

// New builds a Server with base middleware and routes registered.
func New(d Deps) *Server {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	// NOTE: chi's RealIP is deprecated (X-Forwarded-For is spoofable). We key the
	// rate limiter off RemoteAddr directly; add trusted-proxy parsing if deployed
	// behind a load balancer.
	if len(d.CORSOrigins) > 0 {
		// Browser clients (web/mobile) are cross-origin; tokens ride in the
		// Authorization header (not cookies), so no credentials needed.
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins: d.CORSOrigins,
			AllowedMethods: []string{http.MethodGet, http.MethodPost, http.MethodOptions},
			AllowedHeaders: []string{"Authorization", "Content-Type"},
			MaxAge:         300,
		}))
	}
	r.Use(requestObserver(d.Log, d.Metrics)) // wraps RW once: logs + records metrics + in-flight
	r.Use(recoverer(d.Log))                  // structured panic → JSON 500 (inside the observer)
	r.Use(middleware.Timeout(30 * time.Second))
	if d.Verifier != nil {
		// Guest-friendly: attaches a principal when a valid bearer is present,
		// rejects an invalid one, and lets anonymous reads through.
		r.Use(auth.Authenticate(d.Verifier))
	}

	s := &Server{router: r, log: d.Log, ready: d.Ready, verifier: d.Verifier, roles: d.Roles, limiter: d.Limiter, store: d.Store, geo: d.Geo, transit: d.Transit, accounts: d.Accounts, metrics: d.Metrics}
	s.routes()
	return s
}

// Handler exposes the router as an http.Handler.
func (s *Server) Handler() http.Handler { return s.router }

func (s *Server) routes() {
	// Probes are unauthenticated and unthrottled (orchestrators poll them often).
	s.router.Get("/healthz", s.handleHealth)
	s.router.Get("/readyz", s.handleReady)
	if s.metrics != nil {
		s.router.Handle("/metrics", s.metrics.Handler())
	}

	if s.store != nil {
		// /points mixes public reads with authenticated writes. chi mounts a
		// subrouter for the prefix, so every /points route lives inside it.
		s.router.Route("/points", func(r chi.Router) {
			r.Get("/near", s.handlePointsNear)
			r.Get("/bbox", s.handlePointsBBox)
			r.Get("/search", s.handlePointsSearch)
			r.Get("/{id}", s.handlePointDetail)
			r.Get("/{id}/reviews", s.handlePointReviews)
			r.Group(func(r chi.Router) {
				s.authed(r)
				r.Post("/", s.handleAddPoint)
				r.Post("/{id}/reviews", s.handleAddReview)
			})
		})

		// Public civic + catalog reads.
		s.router.Get("/problems", s.handleListProblems)
		s.router.Get("/problems/bbox", s.handleProblemsBBox)
		s.router.Get("/problems/{id}", s.handleProblemDetail)
		s.router.Get("/reviews/stats", s.handleReviewStats)
		s.router.Get("/catalog/features", s.handleFeatureCatalog)
	}

	// Public, rate-limited proxy surface (guests route + geocode).
	if s.geo != nil {
		s.router.Group(func(r chi.Router) {
			s.limited(r)
			r.Post("/route", s.handleRoute)
			r.Get("/geocode", s.handleGeocode)
			r.Get("/geocode/reverse", s.handleReverseGeocode)
		})
	}

	// Public-transport planning (public, rate-limited).
	if s.transit != nil {
		s.router.Group(func(r chi.Router) {
			s.limited(r)
			r.Get("/transit/plan", s.handleTransitPlan)
		})
	}

	// Server-side signup (public, rate-limited — keyed per IP).
	if s.accounts != nil {
		s.router.Group(func(r chi.Router) {
			s.limited(r)
			r.Post("/auth/signup", s.handleSignup)
		})
	}

	// Authenticated, rate-limited surface.
	s.router.Group(func(r chi.Router) {
		s.authed(r)
		r.Get("/me", s.handleMe)
		if s.store != nil {
			r.Post("/me/profile", s.handleProfileSync)
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

// requestObserver wraps the response writer once to emit a structured access log
// and (if set) Prometheus metrics, tracking in-flight requests. The route label
// is the chi pattern (e.g. /points/{id}), not the raw path, to bound cardinality.
func requestObserver(log *slog.Logger, m *metrics.Metrics) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			if m != nil {
				m.IncInFlight()
				defer m.DecInFlight()
			}

			next.ServeHTTP(ww, r)

			route := chi.RouteContext(r.Context()).RoutePattern()
			if route == "" {
				route = "unmatched"
			}
			status := ww.Status()
			if status == 0 {
				status = http.StatusOK // handler wrote body without an explicit header
			}
			dur := time.Since(start)
			log.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"route", route,
				"status", status,
				"bytes", ww.BytesWritten(),
				"dur_ms", dur.Milliseconds(),
				"req_id", middleware.GetReqID(r.Context()),
			)
			if m != nil {
				m.Observe(r.Method, route, status, dur)
			}
		})
	}
}

// recoverer turns a handler panic into a structured error log + a JSON 500,
// instead of chi's default plaintext response.
func recoverer(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				rec := recover()
				if rec == nil {
					return
				}
				if rec == http.ErrAbortHandler { // client aborted; let the server handle it
					panic(rec)
				}
				log.Error("panic recovered",
					"err", rec,
					"path", r.URL.Path,
					"req_id", middleware.GetReqID(r.Context()),
					"stack", string(debug.Stack()),
				)
				httpx.Error(w, http.StatusInternalServerError, "internal", "internal error")
			}()
			next.ServeHTTP(w, r)
		})
	}
}
