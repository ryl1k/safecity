package server

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func corsServer() *Server {
	return New(Deps{
		Log:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		CORSOrigins: []string{"http://localhost:3000"},
	})
}

func TestCORSPreflightAllowsKnownOrigin(t *testing.T) {
	req := httptest.NewRequest(http.MethodOptions, "/healthz", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Access-Control-Request-Method", "GET")
	rec := httptest.NewRecorder()
	corsServer().Handler().ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("Allow-Origin = %q, want the web origin", got)
	}
}

func TestCORSActualRequestHasHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()
	corsServer().Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("Allow-Origin = %q on actual request", got)
	}
}

func TestCORSUnknownOriginNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", "https://evil.example")
	rec := httptest.NewRecorder()
	corsServer().Handler().ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got == "https://evil.example" {
		t.Fatal("must not echo an unknown origin")
	}
}
