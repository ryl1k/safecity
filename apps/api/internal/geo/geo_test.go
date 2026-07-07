package geo

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const orsGeoJSONBody = `{"features":[{"geometry":{"coordinates":[[24.0,49.8],[24.1,49.9]]},` +
	`"properties":{"summary":{"distance":1234,"duration":567},` +
	`"segments":[{"distance":1234,"duration":567,"steps":[{"instruction":"Head north","distance":100}]}]}}]}`

func newClient(base string) *Client { return New("test-key", base, base, 5*time.Second) }

func TestRouteWheelchairOK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/v2/directions/wheelchair/geojson") {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "test-key" {
			t.Errorf("missing ORS auth header")
		}
		_, _ = io.WriteString(w, orsGeoJSONBody)
	}))
	defer srv.Close()

	res, err := newClient(srv.URL).Route(context.Background(), RouteInput{
		From: [2]float64{24.0, 49.8}, To: [2]float64{24.1, 49.9},
		Profile: "wheelchair", Restrictions: DefaultRestrictions(),
	})
	if err != nil {
		t.Fatalf("Route: %v", err)
	}
	if res.Profile != "wheelchair" || res.Fallback {
		t.Fatalf("profile=%s fallback=%v", res.Profile, res.Fallback)
	}
	if len(res.Coordinates) != 2 || len(res.Steps) != 1 {
		t.Fatalf("coords=%d steps=%d", len(res.Coordinates), len(res.Steps))
	}
	if res.Summary == nil || res.Summary.Distance != 1234 {
		t.Fatalf("summary=%+v", res.Summary)
	}
}

func TestRouteFallsBackToFoot(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/wheelchair/") {
			http.Error(w, "no wheelchair route", http.StatusNotFound)
			return
		}
		_, _ = io.WriteString(w, orsGeoJSONBody)
	}))
	defer srv.Close()

	res, err := newClient(srv.URL).Route(context.Background(), RouteInput{
		From: [2]float64{24.0, 49.8}, To: [2]float64{24.1, 49.9}, Profile: "wheelchair",
	})
	if err != nil {
		t.Fatalf("Route: %v", err)
	}
	if res.Profile != "foot-walking" || !res.Fallback {
		t.Fatalf("expected foot-walking fallback, got profile=%s fallback=%v", res.Profile, res.Fallback)
	}
}

func TestRouteSendsAvoidPolygons(t *testing.T) {
	var gotBody atomic.Value
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		gotBody.Store(string(b))
		_, _ = io.WriteString(w, orsGeoJSONBody)
	}))
	defer srv.Close()

	avoid := AvoidSquares([][2]float64{{24.05, 49.85}})
	res, err := newClient(srv.URL).Route(context.Background(), RouteInput{
		From: [2]float64{24.0, 49.8}, To: [2]float64{24.1, 49.9}, Profile: "wheelchair",
		Restrictions: DefaultRestrictions(), Avoid: avoid,
	})
	if err != nil {
		t.Fatalf("Route: %v", err)
	}
	body, _ := gotBody.Load().(string)
	if !strings.Contains(body, "avoid_polygons") || !strings.Contains(body, "MultiPolygon") {
		t.Fatalf("avoid_polygons not in ORS payload: %s", body)
	}
	if !strings.Contains(body, "profile_params") {
		t.Fatalf("wheelchair restrictions missing: %s", body)
	}
	if res.Avoided != 1 {
		t.Fatalf("avoided = %d, want 1", res.Avoided)
	}
}

func TestRouteUnavailableWithoutKey(t *testing.T) {
	c := New("", "http://example.invalid", "http://example.invalid", time.Second)
	if _, err := c.Route(context.Background(), RouteInput{Profile: "wheelchair"}); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("expected ErrUnavailable, got %v", err)
	}
}

func TestRouteUpstreamErrorBubbles(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()
	// foot-walking has no fallback, so a 500 surfaces as an error.
	if _, err := newClient(srv.URL).Route(context.Background(), RouteInput{Profile: "foot-walking"}); err == nil {
		t.Fatal("expected error on upstream 500")
	}
}

func TestGeocodeOKAndCaches(t *testing.T) {
	var hits int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&hits, 1)
		if r.Header.Get("User-Agent") == "" {
			t.Error("missing User-Agent (Nominatim rejects empty UA)")
		}
		_, _ = io.WriteString(w, `[{"place_id":1,"display_name":"Lviv, Ukraine","lon":"24.0316","lat":"49.8419"}]`)
	}))
	defer srv.Close()

	c := newClient(srv.URL)
	got, err := c.Geocode(context.Background(), "lviv", 5)
	if err != nil {
		t.Fatalf("Geocode: %v", err)
	}
	if len(got) != 1 || got[0].ID != "osm-1" || got[0].Label != "Lviv, Ukraine" {
		t.Fatalf("places = %+v", got)
	}
	if got[0].Lng != 24.0316 || got[0].Lat != 49.8419 {
		t.Fatalf("coords = %v/%v", got[0].Lng, got[0].Lat)
	}
	// Second identical call must hit the cache, not the server.
	if _, err := c.Geocode(context.Background(), "lviv", 5); err != nil {
		t.Fatalf("Geocode 2: %v", err)
	}
	if n := atomic.LoadInt64(&hits); n != 1 {
		t.Fatalf("server hits = %d, want 1 (cache miss)", n)
	}
}

func TestGeocodeShortQuery(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		t.Error("should not call Nominatim for a short query")
	}))
	defer srv.Close()
	got, err := newClient(srv.URL).Geocode(context.Background(), "lv", 5)
	if err != nil || len(got) != 0 {
		t.Fatalf("got %v, err %v; want empty/nil", got, err)
	}
}
