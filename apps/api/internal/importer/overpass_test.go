package importer

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestTransientOverpass(t *testing.T) {
	for _, code := range []int{429, 502, 503, 504} {
		if !transientOverpass(code) {
			t.Errorf("status %d should be transient", code)
		}
	}
	for _, code := range []int{200, 400, 403, 404} {
		if transientOverpass(code) {
			t.Errorf("status %d should not be transient", code)
		}
	}
}

// withFastBackoffs shrinks the retry waits for tests and restores them after.
func withFastBackoffs(t *testing.T) {
	t.Helper()
	orig := overpassBackoffs
	overpassBackoffs = []time.Duration{time.Millisecond, time.Millisecond, time.Millisecond}
	t.Cleanup(func() { overpassBackoffs = orig })
}

func TestPostOverpassRetriesTransient(t *testing.T) {
	withFastBackoffs(t)
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// The header the live 406 fix added — still sent through the retry path.
		if ua := r.Header.Get("User-Agent"); ua != userAgent {
			t.Errorf("User-Agent = %q, want %q", ua, userAgent)
		}
		n := atomic.AddInt32(&calls, 1)
		if n < 3 {
			w.WriteHeader(http.StatusGatewayTimeout) // 504 twice, then succeed
			_, _ = w.Write([]byte("gateway timeout"))
			return
		}
		_, _ = w.Write([]byte(`{"elements":[]}`))
	}))
	defer srv.Close()

	data, err := postOverpass(context.Background(), srv.Client(), srv.URL, "q")
	if err != nil {
		t.Fatalf("expected success after retries, got %v", err)
	}
	if string(data) != `{"elements":[]}` {
		t.Fatalf("body = %q", data)
	}
	if got := atomic.LoadInt32(&calls); got != 3 {
		t.Fatalf("expected 3 attempts (2 retries), got %d", got)
	}
}

func TestPostOverpassExhaustsRetries(t *testing.T) {
	withFastBackoffs(t)
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	if _, err := postOverpass(context.Background(), srv.Client(), srv.URL, "q"); err == nil {
		t.Fatal("expected error after exhausting retries")
	}
	if got := atomic.LoadInt32(&calls); got != int32(len(overpassBackoffs)+1) {
		t.Fatalf("expected %d attempts, got %d", len(overpassBackoffs)+1, got)
	}
}

func TestPostOverpassPermanentNoRetry(t *testing.T) {
	withFastBackoffs(t)
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusBadRequest) // 400 — permanent, must not retry
	}))
	defer srv.Close()

	if _, err := postOverpass(context.Background(), srv.Client(), srv.URL, "q"); err == nil {
		t.Fatal("expected error on 400")
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("permanent error should not retry, got %d attempts", got)
	}
}

func TestPostOverpassRespectsContext(t *testing.T) {
	orig := overpassBackoffs
	overpassBackoffs = []time.Duration{time.Hour} // long enough that ctx wins
	t.Cleanup(func() { overpassBackoffs = orig })

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, err := postOverpass(ctx, srv.Client(), srv.URL, "q"); err == nil {
		t.Fatal("expected context error while backing off")
	}
}
