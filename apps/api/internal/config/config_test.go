package config

import "testing"

func TestLoadRequiresDBAndSupabase(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("SUPABASE_URL", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected error when required env is missing")
	}
}

func TestLoadDerivesJWKSURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("SUPABASE_URL", "https://ref.supabase.co/")
	c, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c.SupabaseURL != "https://ref.supabase.co" {
		t.Fatalf("SupabaseURL not trimmed: %q", c.SupabaseURL)
	}
	if c.JWKSURL != "https://ref.supabase.co/auth/v1/.well-known/jwks.json" {
		t.Fatalf("JWKSURL = %q", c.JWKSURL)
	}
}
