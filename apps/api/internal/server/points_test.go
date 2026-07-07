package server

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/safecity/api/internal/store"
)

func pointServer(fs DataStore) *Server {
	return New(Deps{Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Store: fs})
}

func get(srv *Server, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestPointsNearOK(t *testing.T) {
	addr := "Rynok Sq"
	fs := &fakeStore{near: []store.PointSummary{{ID: "p1", Name: "Ratusha", Address: &addr}}}
	rec := get(pointServer(fs), "/points/near?lng=24.03&lat=49.84&radius=800")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotNearLng != 24.03 || fs.gotNearLat != 49.84 || fs.gotNearRadius != 800 {
		t.Fatalf("store got %v/%v/%v", fs.gotNearLng, fs.gotNearLat, fs.gotNearRadius)
	}
	if !strings.Contains(rec.Body.String(), `"id":"p1"`) {
		t.Fatalf("missing point: %s", rec.Body.String())
	}
}

func TestPointsNearDefaultRadius(t *testing.T) {
	fs := &fakeStore{}
	if rec := get(pointServer(fs), "/points/near?lng=24.03&lat=49.84"); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if fs.gotNearRadius != defaultRadiusM {
		t.Fatalf("radius = %v, want default %d", fs.gotNearRadius, defaultRadiusM)
	}
}

func TestPointsNearMissingParams(t *testing.T) {
	if rec := get(pointServer(&fakeStore{}), "/points/near?lng=24.03"); rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestPointsNearBadRadius(t *testing.T) {
	if rec := get(pointServer(&fakeStore{}), "/points/near?lng=24.03&lat=49.84&radius=999999"); rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (radius over cap)", rec.Code)
	}
}

func TestPointsNearOutOfRange(t *testing.T) {
	if rec := get(pointServer(&fakeStore{}), "/points/near?lng=500&lat=49.84"); rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (lng out of range)", rec.Code)
	}
}

func TestPointsBBoxOK(t *testing.T) {
	fs := &fakeStore{bbox: []store.PointSummary{{ID: "p2"}}}
	rec := get(pointServer(fs), "/points/bbox?min_lng=24.0&min_lat=49.8&max_lng=24.1&max_lat=49.9")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"id":"p2"`) {
		t.Fatalf("missing point: %s", rec.Body.String())
	}
}

func TestPointsBBoxMissingParams(t *testing.T) {
	if rec := get(pointServer(&fakeStore{}), "/points/bbox?min_lng=24.0&min_lat=49.8"); rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestPointDetailOK(t *testing.T) {
	fs := &fakeStore{detail: &store.PointDetail{ID: sampleUUID, Name: "Opera"}}
	rec := get(pointServer(fs), "/points/"+sampleUUID)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotDetailID != sampleUUID {
		t.Fatalf("store got id %q, want %s", fs.gotDetailID, sampleUUID)
	}
}

func TestPointDetailBadID(t *testing.T) {
	// A non-UUID id is rejected before hitting the store (also stops the
	// `/points/undefined` 500 the web used to trigger).
	if rec := get(pointServer(&fakeStore{}), "/points/undefined"); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestPointDetailNotFound(t *testing.T) {
	fs := &fakeStore{detail: nil} // store returns (nil, nil) → 404
	if rec := get(pointServer(fs), "/points/"+sampleUUID); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}
