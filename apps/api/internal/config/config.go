// Package config loads typed configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strings"
)

// Config holds runtime settings for the API service.
type Config struct {
	Env      string // development | production
	Port     string
	LogLevel string // debug | info | warn | error

	DatabaseURL       string // Supabase Postgres (session pooler URI)
	SupabaseURL       string // project URL, e.g. https://<ref>.supabase.co
	JWKSURL           string // derived: SupabaseURL + /auth/v1/.well-known/jwks.json
	JWTIssuer         string // derived: SupabaseURL + /auth/v1 (expected `iss` claim)
	SupabasePublicKey string // publishable key (apikey header for Supabase REST)
	SupabaseSecretKey string // service key for admin ops (keep server-side only)

	ORSAPIKey  string // OpenRouteService key (routing proxy)
	ORSBaseURL string
	MLGRPCAddr string // Python ML gRPC service address
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
		MLGRPCAddr:        os.Getenv("ML_GRPC_URL"),
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
