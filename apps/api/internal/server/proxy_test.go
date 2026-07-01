package server

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/safecity/api/internal/geo"
	"github.com/safecity/api/internal/store"
)

func proxyServer(fg GeoService, fs DataStore) *Server {
	return New(Deps{Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Geo: fg, Store: fs})
}

func postJSON(srv *Server, path, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, path, strings.NewReader(body)))
	return rec
}

func TestRouteOK(t *testing.T) {
	fg := &fakeGeo{route: geo.RouteResult{Profile: "wheelchair", Coordinates: [][]float64{{24, 49.8}}}}
	fs := &fakeStore{barriers: []store.LngLat{{Lng: 24.05, Lat: 49.85}}}
	rec := postJSON(proxyServer(fg, fs), "/route", `{"from":[24.0,49.8],"to":[24.1,49.9],"profile":"wheelchair"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if fg.gotRoute.Profile != "wheelchair" {
		t.Fatalf("geo got profile %q", fg.gotRoute.Profile)
	}
	// Barriers from the store must be turned into avoid polygons server-side.
	if len(fg.gotRoute.Avoid) != 1 {
		t.Fatalf("avoid polygons = %d, want 1", len(fg.gotRoute.Avoid))
	}
}

func TestRouteEmptyViaAccepted(t *testing.T) {
	// The web always sends `via` (an empty array for a 2-point route); the strict
	// decoder must not reject it as an unknown field.
	fg := &fakeGeo{route: geo.RouteResult{Profile: "wheelchair"}}
	rec := postJSON(proxyServer(fg, &fakeStore{}), "/route", `{"from":[24.0,49.8],"to":[24.1,49.9],"via":[],"profile":"wheelchair"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
}

func TestRouteWithVia(t *testing.T) {
	// Intermediate stops must be forwarded to the routing engine in order.
	fg := &fakeGeo{route: geo.RouteResult{Profile: "wheelchair"}}
	rec := postJSON(proxyServer(fg, &fakeStore{}), "/route",
		`{"from":[24.0,49.8],"to":[24.1,49.9],"via":[[24.05,49.85]],"profile":"wheelchair"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if len(fg.gotRoute.Via) != 1 || fg.gotRoute.Via[0] != [2]float64{24.05, 49.85} {
		t.Fatalf("via = %v, want [[24.05 49.85]]", fg.gotRoute.Via)
	}
}

func TestRouteViaOutOfRange(t *testing.T) {
	rec := postJSON(proxyServer(&fakeGeo{}, &fakeStore{}), "/route",
		`{"from":[24.0,49.8],"to":[24.1,49.9],"via":[[500,49.85]]}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestRouteBlindUsesFoot(t *testing.T) {
	fg := &fakeGeo{}
	postJSON(proxyServer(fg, &fakeStore{}), "/route", `{"from":[24.0,49.8],"to":[24.1,49.9],"profile":"blind"}`)
	if fg.gotRoute.Profile != "foot-walking" {
		t.Fatalf("profile = %q, want foot-walking", fg.gotRoute.Profile)
	}
}

func TestRouteAppliesParamOverrides(t *testing.T) {
	fg := &fakeGeo{}
	postJSON(proxyServer(fg, &fakeStore{}), "/route",
		`{"from":[24.0,49.8],"to":[24.1,49.9],"params":{"minWidth":1.2}}`)
	if fg.gotRoute.Restrictions.MinWidth != 1.2 {
		t.Fatalf("minWidth = %v, want 1.2", fg.gotRoute.Restrictions.MinWidth)
	}
	if fg.gotRoute.Restrictions.MaxIncline != 6 { // default preserved
		t.Fatalf("maxIncline = %v, want default 6", fg.gotRoute.Restrictions.MaxIncline)
	}
}

func TestRouteMissingTo(t *testing.T) {
	rec := postJSON(proxyServer(&fakeGeo{}, &fakeStore{}), "/route", `{"from":[24.0,49.8]}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestRouteOutOfRange(t *testing.T) {
	rec := postJSON(proxyServer(&fakeGeo{}, &fakeStore{}), "/route", `{"from":[500,49.8],"to":[24.1,49.9]}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestRouteUnavailable(t *testing.T) {
	fg := &fakeGeo{routeErr: geo.ErrUnavailable}
	rec := postJSON(proxyServer(fg, &fakeStore{}), "/route", `{"from":[24.0,49.8],"to":[24.1,49.9]}`)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

func TestRouteBarrierLookupFailureStillRoutes(t *testing.T) {
	// A barrier-lookup error must not block routing (best-effort avoidance).
	fg := &fakeGeo{route: geo.RouteResult{Profile: "wheelchair"}}
	fs := &fakeStore{barriersErr: io.ErrUnexpectedEOF}
	rec := postJSON(proxyServer(fg, fs), "/route", `{"from":[24.0,49.8],"to":[24.1,49.9]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 despite barrier lookup failure", rec.Code)
	}
	if len(fg.gotRoute.Avoid) != 0 {
		t.Fatalf("avoid should be empty on lookup failure, got %d", len(fg.gotRoute.Avoid))
	}
}

func TestGeocodeOK(t *testing.T) {
	fg := &fakeGeo{places: []geo.Place{{ID: "osm-1", Label: "Lviv"}}}
	rec := httptest.NewRecorder()
	proxyServer(fg, &fakeStore{}).Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/geocode?q=lviv&limit=3", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if fg.gotGeoQuery != "lviv" || fg.gotGeoLimit != 3 {
		t.Fatalf("geo got q=%q limit=%d", fg.gotGeoQuery, fg.gotGeoLimit)
	}
	if !strings.Contains(rec.Body.String(), `"osm-1"`) {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

func TestGeocodeUpstreamError(t *testing.T) {
	fg := &fakeGeo{geoErr: io.ErrUnexpectedEOF}
	rec := httptest.NewRecorder()
	proxyServer(fg, &fakeStore{}).Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/geocode?q=lviv", nil))
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
}
