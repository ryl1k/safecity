package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newTestServer(ready func(context.Context) error) *Server {
	return New(Deps{Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Ready: ready})
}

func TestHealthz(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestServer(nil).Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["status"] != "ok" {
		t.Fatalf("status field = %q, want ok", body["status"])
	}
}

func TestReadyzOK(t *testing.T) {
	rec := httptest.NewRecorder()
	ready := func(context.Context) error { return nil }
	newTestServer(ready).Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}

func TestMeRequiresAuth(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestServer(nil).Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/me", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestReadyzUnavailable(t *testing.T) {
	rec := httptest.NewRecorder()
	ready := func(context.Context) error { return errors.New("db down") }
	newTestServer(ready).Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}
