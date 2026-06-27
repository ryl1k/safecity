// Package ratelimit provides a keyed token-bucket limiter and HTTP middleware,
// used to throttle writes and proxy endpoints per user (or per IP for guests).
package ratelimit

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/safecity/api/internal/httpx"
)

// Limiter holds one token bucket per key, evicting buckets idle past ttl.
type Limiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rps     rate.Limit
	burst   int
	ttl     time.Duration
	now     func() time.Time // injectable for tests
}

type bucket struct {
	lim  *rate.Limiter
	seen time.Time
}

// New builds a Limiter allowing rps requests/second with the given burst.
func New(rps float64, burst int) *Limiter {
	return &Limiter{
		buckets: make(map[string]*bucket),
		rps:     rate.Limit(rps),
		burst:   burst,
		ttl:     10 * time.Minute,
		now:     time.Now,
	}
}

// Allow reports whether a request for key may proceed, consuming a token.
func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{lim: rate.NewLimiter(l.rps, l.burst)}
		l.buckets[key] = b
	}
	b.seen = l.now()
	return b.lim.Allow()
}

// cleanup drops buckets not seen within ttl. Called periodically by the janitor.
func (l *Limiter) cleanup() {
	l.mu.Lock()
	defer l.mu.Unlock()
	cutoff := l.now().Add(-l.ttl)
	for k, b := range l.buckets {
		if b.seen.Before(cutoff) {
			delete(l.buckets, k)
		}
	}
}

// StartJanitor runs periodic eviction until stop is closed. Safe to skip in tests.
func (l *Limiter) StartJanitor(stop <-chan struct{}) {
	ticker := time.NewTicker(l.ttl)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				l.cleanup()
			case <-stop:
				return
			}
		}
	}()
}

// KeyFunc derives the rate-limit key for a request (e.g. user id or client IP).
type KeyFunc func(*http.Request) string

// Middleware throttles requests keyed by key(r). Over-limit requests get 429 with
// a Retry-After header and the standard JSON error envelope.
func (l *Limiter) Middleware(key KeyFunc) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !l.Allow(key(r)) {
				w.Header().Set("Retry-After", strconv.Itoa(retryAfterSeconds(l.rps)))
				httpx.Error(w, http.StatusTooManyRequests, "rate_limited", "too many requests, slow down")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func retryAfterSeconds(r rate.Limit) int {
	if r <= 0 {
		return 1
	}
	s := int(1 / float64(r))
	if s < 1 {
		return 1
	}
	return s
}
