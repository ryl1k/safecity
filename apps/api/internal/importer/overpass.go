package importer

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// overpassBackoffs is the wait schedule between retry attempts. Its length + 1
// is the total number of attempts. A package var so tests can shorten it.
// Deliberately generous: Overpass 504s usually mean the server is overloaded or
// the query ran long, so it needs real recovery room, not a tight retry.
var overpassBackoffs = []time.Duration{5 * time.Second, 15 * time.Second, 30 * time.Second}

// transientOverpass reports whether an Overpass HTTP status is worth retrying —
// server-side/load conditions that typically clear on a later attempt, as
// opposed to a permanent client error (4xx other than 429).
func transientOverpass(code int) bool {
	switch code {
	case http.StatusTooManyRequests, // 429 — rate limited
		http.StatusBadGateway,         // 502
		http.StatusServiceUnavailable, // 503 — no free slot
		http.StatusGatewayTimeout:     // 504 — query/gateway timed out
		return true
	}
	return false
}

// postOverpass sends an Overpass query and returns the raw JSON body, retrying
// transient failures (429/502/503/504 and network errors) with backoff.
// Overpass is a shared public service that periodically returns these under
// load; a single blip should not fail a long import.
func postOverpass(ctx context.Context, client *http.Client, endpoint, query string) ([]byte, error) {
	body := "data=" + url.QueryEscape(query)
	maxAttempts := len(overpassBackoffs) + 1
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("User-Agent", userAgent)

		resp, err := client.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("overpass request: %w", err)
		} else {
			data, readErr := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
			_ = resp.Body.Close()
			switch {
			case resp.StatusCode == http.StatusOK && readErr == nil:
				return data, nil
			case resp.StatusCode == http.StatusOK:
				lastErr = fmt.Errorf("read overpass body: %w", readErr)
			default:
				lastErr = fmt.Errorf("overpass %d: %s", resp.StatusCode, truncateBytes(data, 300))
				if !transientOverpass(resp.StatusCode) {
					return nil, lastErr // permanent — don't retry
				}
			}
		}
		if attempt <= len(overpassBackoffs) {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(overpassBackoffs[attempt-1]):
			}
		}
	}
	return nil, lastErr
}

func truncateBytes(b []byte, n int) string {
	if len(b) > n {
		return string(b[:n]) + "…"
	}
	return string(b)
}
