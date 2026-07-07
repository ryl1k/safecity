// Package config loads typed configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds runtime settings for the API service.
type Config struct {
	Env      string // development | production
	Port     string
	LogLevel string // debug | info | warn | error

	DatabaseURL       string // Supabase Postgres (TRANSACTION pooler URI, port 6543)
	SupabaseURL       string // project URL, e.g. https://<ref>.supabase.co
	JWKSURL           string // derived: SupabaseURL + /auth/v1/.well-known/jwks.json
	JWTIssuer         string // derived: SupabaseURL + /auth/v1 (expected `iss` claim)
	SupabasePublicKey string // publishable key (apikey header for Supabase REST)
	SupabaseSecretKey string // service key for admin ops (keep server-side only)

	ORSAPIKey     string // OpenRouteService key (routing proxy)
	ORSBaseURL    string
	NominatimURL  string // geocoding base (self-host door)
	TransitousURL string // public-transport planning base (MOTIS API)
	MLGRPCAddr    string // Python ML gRPC service address

	RateRPS   float64 // per-key sustained requests/second on throttled routes
	RateBurst int     // per-key burst allowance

	CORSOrigins []string // allowed browser origins for the web/mobile clients
}

// Load reads config from the environment and fails fast on missing required vars.
func Load() (Config, error) {
	c := Config{
		Env:               env("API_ENV", "development"),
		Port:              env("PORT", "8080"),
		LogLevel:          env("LOG_LEVEL", "info"),
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		SupabaseURL:       strings.TrimRight(os.Getenv("SUPABASE_URL"), "/"),
		SupabasePublicKey: os.Getenv("SUPABASE_PUBLISHABLE_KEY"),
		SupabaseSecretKey: os.Getenv("SUPABASE_SECRET_KEY"),
		ORSAPIKey:         os.Getenv("ORS_API_KEY"),
		ORSBaseURL:        env("ORS_BASE_URL", "https://api.openrouteservice.org"),
		NominatimURL:      env("NOMINATIM_URL", "https://nominatim.openstreetmap.org"),
		TransitousURL:     env("TRANSITOUS_URL", "https://api.transitous.org/api/v3"),
		MLGRPCAddr:        os.Getenv("ML_GRPC_URL"),
		RateRPS:           envFloat("RATE_LIMIT_RPS", 10),
		RateBurst:         envInt("RATE_LIMIT_BURST", 20),
		CORSOrigins:       csv(env("CORS_ORIGINS", "http://localhost:3000")),
	}

	var missing []string
	if c.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if c.SupabaseURL == "" {
		missing = append(missing, "SUPABASE_URL")
	}
	if len(missing) > 0 {
		return c, fmt.Errorf("missing required env: %s", strings.Join(missing, ", "))
	}

	c.JWKSURL = c.SupabaseURL + "/auth/v1/.well-known/jwks.json"
	c.JWTIssuer = c.SupabaseURL + "/auth/v1"
	return c, nil
}

// IsDev reports whether the service runs in development mode.
func (c Config) IsDev() bool { return c.Env == "development" }

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// csv splits a comma-separated env value into trimmed, non-empty items.
func csv(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if v := strings.TrimSpace(part); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func envFloat(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
