// Package config loads typed configuration from the environment.
package config

import "os"

// Config holds runtime settings. Expanded as the service grows (DB, auth, etc.).
type Config struct {
	Env      string // development | production
	Port     string
	LogLevel string // debug | info | warn | error
}

// Load reads config from the environment with sensible defaults.
func Load() Config {
	return Config{
		Env:      env("API_ENV", "development"),
		Port:     env("PORT", "8080"),
		LogLevel: env("LOG_LEVEL", "info"),
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
