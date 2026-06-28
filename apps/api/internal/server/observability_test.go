package server

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/safecity/api/internal/metrics"
)

func TestMetricsEndpoint(t *testing.T) {
	m := metrics.New()
	srv := New(Deps{Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Metrics: m})

	// Generate some traffic so a counter exists.
	srv.Handler().ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/healthz", nil))

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "http_requests_total") {
		t.Fatalf("metrics missing http_requests_total:\n%s", body[:min(len(body), 400)])
	}
	// The healthz hit should be recorded against its route pattern, not raw path.
	if !strings.Contains(body, `route="/healthz"`) {
		t.Fatalf("expected healthz route label in metrics")
	}
}

func TestRecovererReturnsJSON500(t *testing.T) {
	r := chi.NewRouter()
	r.Use(recoverer(slog.New(slog.NewTextHandler(io.Discard, nil))))
	r.Get("/boom", func(http.ResponseWriter, *http.Request) { panic("kaboom") })

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/boom", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"code":"internal"`) {
		t.Fatalf("expected JSON error envelope, got %s", rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("content-type = %q, want application/json", ct)
	}
}
