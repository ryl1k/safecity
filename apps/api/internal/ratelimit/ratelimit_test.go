package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// perHour is a near-zero refill rate so burst is the only budget within a test.
const perHour = 1.0 / 3600.0

func TestAllowBurstThenDeny(t *testing.T) {
	l := New(perHour, 2)
	if !l.Allow("k") || !l.Allow("k") {
		t.Fatal("first two requests should be allowed (burst=2)")
	}
	if l.Allow("k") {
		t.Fatal("third request should be denied")
	}
}

func TestAllowKeysIndependent(t *testing.T) {
	l := New(perHour, 1)
	if !l.Allow("a") {
		t.Fatal("a's first request should pass")
	}
	if !l.Allow("b") {
		t.Fatal("b has its own bucket and should pass")
	}
	if l.Allow("a") {
		t.Fatal("a is now out of budget")
	}
}

func TestMiddleware429(t *testing.T) {
	l := New(perHour, 1)
	key := func(*http.Request) string { return "k" }
	h := l.Middleware(key)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	rec1 := httptest.NewRecorder()
	h.ServeHTTP(rec1, httptest.NewRequest(http.MethodPost, "/", nil))
	if rec1.Code != http.StatusOK {
		t.Fatalf("first status = %d, want 200", rec1.Code)
	}

	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, httptest.NewRequest(http.MethodPost, "/", nil))
	if rec2.Code != http.StatusTooManyRequests {
		t.Fatalf("second status = %d, want 429", rec2.Code)
	}
	if rec2.Header().Get("Retry-After") == "" {
		t.Fatal("missing Retry-After header on 429")
	}
}

func TestCleanupEvictsIdle(t *testing.T) {
	l := New(perHour, 1)
	cur := time.Unix(1_000_000, 0)
	l.now = func() time.Time { return cur }

	l.Allow("k")
	if len(l.buckets) != 1 {
		t.Fatalf("buckets = %d, want 1", len(l.buckets))
	}

	cur = cur.Add(l.ttl + time.Minute) // advance past ttl
	l.cleanup()
	if len(l.buckets) != 0 {
		t.Fatalf("buckets after cleanup = %d, want 0", len(l.buckets))
	}
}
