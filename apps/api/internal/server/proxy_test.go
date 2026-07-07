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

func routeAlt(mode string) store.RouteAlternative {
	return store.RouteAlternative{
		Mode: mode, Label: mode, Available: true,
		Coordinates: [][]float64{{24.0, 49.8}, {24.1, 49.9}}, DistanceM: 1000,
	}
}

func TestRouteOK(t *testing.T) {
	fs := &fakeStore{altRoutes: []store.RouteAlternative{routeAlt("moderate")}, barriers: []store.LngLat{{Lng: 24.05, Lat: 49.85}}}
	rec := postJSON(proxyServer(&fakeGeo{}, fs), "/route", `{"from":[24.0,49.8],"to":[24.1,49.9],"profile":"wheelchair"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
}

func TestRouteEmptyViaAccepted(t *testing.T) {
	// The web always sends `via` (an empty array for a 2-point route); the strict
	// decoder must not reject it as an unknown field.
	fs := &fakeStore{altRoutes: []store.RouteAlternative{routeAlt("moderate")}}
	rec := postJSON(proxyServer(&fakeGeo{}, fs), "/route", `{"from":[24.0,49.8],"to":[24.1,49.9],"via":[],"profile":"wheelchair"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
}

func TestRouteWithVia(t *testing.T) {
	// Via waypoints are not supported in the DB routing path.
	rec := postJSON(proxyServer(&fakeGeo{}, &fakeStore{}), "/route",
		`{"from":[24.0,49.8],"to":[24.1,49.9],"via":[[24.05,49.85]],"profile":"wheelchair"}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (via unsupported in DB router)", rec.Code)
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
	// Blind profile is not supported in the DB routing path.
	rec := postJSON(proxyServer(&fakeGeo{}, &fakeStore{}), "/route", `{"from":[24.0,49.8],"to":[24.1,49.9],"profile":"blind"}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (blind profile uses foot-walking, not supported in DB router)", rec.Code)
	}
}

func TestRouteAppliesParamOverrides(t *testing.T) {
	// Params are accepted without error; routing via DB succeeds.
	fs := &fakeStore{altRoutes: []store.RouteAlternative{routeAlt("moderate")}}
	rec := postJSON(proxyServer(&fakeGeo{}, fs), "/route",
		`{"from":[24.0,49.8],"to":[24.1,49.9],"params":{"minWidth":1.2}}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
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
	// A DB routing error must return 500.
	fs := &fakeStore{altRoutesErr: io.ErrUnexpectedEOF}
	rec := postJSON(proxyServer(&fakeGeo{}, fs), "/route", `{"from":[24.0,49.8],"to":[24.1,49.9]}`)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
}

func TestRouteBarrierLookupFailureStillRoutes(t *testing.T) {
	// A barrier-lookup error must not block routing (best-effort avoidance).
	fs := &fakeStore{altRoutes: []store.RouteAlternative{routeAlt("moderate")}, barriersErr: io.ErrUnexpectedEOF}
	rec := postJSON(proxyServer(&fakeGeo{}, fs), "/route", `{"from":[24.0,49.8],"to":[24.1,49.9]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 despite barrier lookup failure", rec.Code)
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

func TestReverseGeocodeOK(t *testing.T) {
	fg := &fakeGeo{reverse: &geo.Place{ID: "osm-9", Label: "вул. Ринок, Львів", Lng: 24.03, Lat: 49.84}}
	rec := httptest.NewRecorder()
	proxyServer(fg, &fakeStore{}).Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/geocode/reverse?lng=24.03&lat=49.84", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if fg.gotRevLng != 24.03 || fg.gotRevLat != 49.84 {
		t.Fatalf("geo got lng=%v lat=%v", fg.gotRevLng, fg.gotRevLat)
	}
	if !strings.Contains(rec.Body.String(), "Ринок") {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

func TestReverseGeocodeNoResult(t *testing.T) {
	fg := &fakeGeo{reverse: nil} // Nominatim had nothing (e.g. open water)
	rec := httptest.NewRecorder()
	proxyServer(fg, &fakeStore{}).Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/geocode/reverse?lng=24.03&lat=49.84", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestReverseGeocodeBadQuery(t *testing.T) {
	rec := httptest.NewRecorder()
	proxyServer(&fakeGeo{}, &fakeStore{}).Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/geocode/reverse?lng=999&lat=49.84", nil))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
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
