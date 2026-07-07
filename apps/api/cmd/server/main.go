// Command server is the SafeCity Go API entrypoint.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/safecity/api/internal/accounts"
	"github.com/safecity/api/internal/auth"
	"github.com/safecity/api/internal/config"
	"github.com/safecity/api/internal/db"
	"github.com/safecity/api/internal/geo"
	"github.com/safecity/api/internal/metrics"
	"github.com/safecity/api/internal/ml"
	"github.com/safecity/api/internal/ratelimit"
	"github.com/safecity/api/internal/server"
	"github.com/safecity/api/internal/store"
	"github.com/safecity/api/internal/transit"
)

func main() {
	// Dev convenience: load repo-root .env if present (no-op in prod).
	_ = godotenv.Load("../../.env", ".env")

	cfg, err := config.Load()
	logger := newLogger(cfg) // Env/LogLevel have defaults even when validation fails
	if err != nil {
		logger.Error("invalid config", "err", err)
		os.Exit(1)
	}

	ctx := context.Background()
	database, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("db connect failed", "err", err)
		os.Exit(1)
	}
	defer database.Close()
	logger.Info("db connected")

	verifier, err := auth.NewVerifier(ctx, cfg.JWKSURL, cfg.JWTIssuer)
	if err != nil {
		logger.Error("jwks init failed", "err", err)
		os.Exit(1)
	}
	logger.Info("jwks loaded", "issuer", cfg.JWTIssuer)

	limiter := ratelimit.New(cfg.RateRPS, cfg.RateBurst)
	stopJanitor := make(chan struct{})
	defer close(stopJanitor)
	limiter.StartJanitor(stopJanitor)

	geoClient := geo.New(cfg.ORSAPIKey, cfg.ORSBaseURL, cfg.NominatimURL, 15*time.Second)
	st := store.New(database)
	transitClient := transit.New(cfg.TransitousURL, 20*time.Second).
		WithWalkRouter(func(fromLng, fromLat, toLng, toLat float64) ([][2]float64, error) {
			ar, err := st.RouteAccessible(ctx, fromLng, fromLat, toLng, toLat)
			if err != nil || ar == nil {
				return nil, err
			}
			coords := make([][2]float64, len(ar.Coordinates))
			for i, c := range ar.Coordinates {
				if len(c) >= 2 {
					coords[i] = [2]float64{c[0], c[1]}
				}
			}
			return coords, nil
		})

	// Server-side signup needs the service key; without it the route is disabled.
	var accountsClient server.AccountService
	if ac := accounts.New(cfg.SupabaseURL, cfg.SupabaseSecretKey, 10*time.Second); ac.Configured() {
		accountsClient = ac
	} else {
		logger.Warn("SUPABASE_SECRET_KEY not set — /auth/signup disabled")
	}

	// ML gRPC client (optional; connection is lazy so this never blocks startup).
	if cfg.MLGRPCAddr != "" {
		mlClient, err := ml.Dial(cfg.MLGRPCAddr)
		if err != nil {
			logger.Error("ml client init failed", "err", err)
			os.Exit(1)
		}
		defer func() { _ = mlClient.Close() }()
		logger.Info("ml client ready", "addr", cfg.MLGRPCAddr)
		// TODO: pass mlClient to the server once photo-analysis endpoints land.
		_ = mlClient
	}

	srv := server.New(server.Deps{
		Log:         logger,
		Ready:       database.Ping,
		Verifier:    verifier,
		Roles:       database.Role,
		Limiter:     limiter,
		Store:       st,
		Geo:         geoClient,
		Transit:     transitClient,
		Accounts:    accountsClient,
		Metrics:     metrics.New(),
		CORSOrigins: cfg.CORSOrigins,
	})
	httpSrv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		logger.Info("api listening", "addr", httpSrv.Addr, "env", cfg.Env)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	logger.Info("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(ctx); err != nil {
		logger.Error("shutdown error", "err", err)
	}
}

func newLogger(cfg config.Config) *slog.Logger {
	level := slog.LevelInfo
	switch cfg.LogLevel {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	}
	opts := &slog.HandlerOptions{Level: level}
	if cfg.Env == "development" {
		return slog.New(slog.NewTextHandler(os.Stdout, opts))
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, opts))
}
