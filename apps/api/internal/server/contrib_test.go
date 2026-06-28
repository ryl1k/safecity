package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/safecity/api/internal/auth"
	"github.com/safecity/api/internal/store"
)

const sampleUUID = "5f9b1c1e-2c2a-4e1a-8b3a-2b6b7c8d9e0f"

// authedReq builds an authenticated request with an injected principal (verifier
// is nil in tests, so Authenticate is not mounted and the principal survives).
func authedReq(method, path, body string) *http.Request {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	return req.WithContext(auth.WithPrincipal(req.Context(), &auth.Principal{UserID: "u1"}))
}

func do(srv *Server, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func TestAddPointRequiresAuth(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/points", strings.NewReader(`{"name":"X","category":"venue","lat":49.8,"lng":24.0}`))
	if rec := do(problemServer(&fakeStore{}), req); rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestAddPointOK(t *testing.T) {
	fs := &fakeStore{pointID: "pt-1"}
	body := `{"name":"Ratusha","category":"venue","lat":49.8419,"lng":24.0316,"address":"Rynok 1","features":{"ramp":"yes"},"photos":["https://cdn/x.jpg"]}`
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/points", body))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotUser != "u1" || fs.gotPoint.Name != "Ratusha" || fs.gotPoint.Category != "venue" {
		t.Fatalf("store got %+v (user %q)", fs.gotPoint, fs.gotUser)
	}
	if fs.gotPoint.Lat != 49.8419 || fs.gotPoint.Lng != 24.0316 {
		t.Fatalf("coords = %v/%v", fs.gotPoint.Lat, fs.gotPoint.Lng)
	}
	if fs.gotPoint.Features["ramp"] != "yes" {
		t.Fatalf("features = %v", fs.gotPoint.Features)
	}
	if !strings.Contains(rec.Body.String(), `"id":"pt-1"`) {
		t.Fatalf("missing id: %s", rec.Body.String())
	}
}

func TestAddPointMissingName(t *testing.T) {
	rec := do(problemServer(&fakeStore{}), authedReq(http.MethodPost, "/points", `{"category":"venue","lat":49.8,"lng":24.0}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestAddPointBadCategory(t *testing.T) {
	rec := do(problemServer(&fakeStore{}), authedReq(http.MethodPost, "/points", `{"name":"Valid Name","category":"airport","lat":49.8,"lng":24.0}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestAddPointBadFeatureValue(t *testing.T) {
	rec := do(problemServer(&fakeStore{}), authedReq(http.MethodPost, "/points",
		`{"name":"Valid Name","category":"venue","lat":49.8,"lng":24.0,"features":{"ramp":"maybe"}}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (feature value not yes/no/unknown)", rec.Code)
	}
}

func TestAddPointMissingCoords(t *testing.T) {
	rec := do(problemServer(&fakeStore{}), authedReq(http.MethodPost, "/points", `{"name":"Valid Name","category":"venue"}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422 (lat/lng required)", rec.Code)
	}
}

func TestAddPointUnknownFeatureKey(t *testing.T) {
	// store maps the FK violation to ErrNotFound; handler reports it as a field error.
	fs := &fakeStore{pointErr: store.ErrNotFound}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/points", `{"name":"Valid Name","category":"venue","lat":49.8,"lng":24.0,"features":{"bogus":"yes"}}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"field":"features"`) {
		t.Fatalf("expected features field error: %s", rec.Body.String())
	}
}

func TestAddReviewOK(t *testing.T) {
	fs := &fakeStore{review: store.Review{ID: "rv-1"}}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/points/"+sampleUUID+"/reviews",
		`{"profile":"wheelchair","stars":4,"text":"ok"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotReviewPoint != sampleUUID || fs.gotReview.Profile != "wheelchair" || fs.gotReview.Stars != 4 {
		t.Fatalf("store got point=%q review=%+v", fs.gotReviewPoint, fs.gotReview)
	}
}

func TestAddReviewBadStars(t *testing.T) {
	rec := do(problemServer(&fakeStore{}), authedReq(http.MethodPost, "/points/"+sampleUUID+"/reviews",
		`{"profile":"blind","stars":7}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestAddReviewBadProfile(t *testing.T) {
	rec := do(problemServer(&fakeStore{}), authedReq(http.MethodPost, "/points/"+sampleUUID+"/reviews",
		`{"profile":"hearing","stars":3}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestAddReviewBadPointID(t *testing.T) {
	rec := do(problemServer(&fakeStore{}), authedReq(http.MethodPost, "/points/not-a-uuid/reviews",
		`{"profile":"blind","stars":3}`))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestAddReviewPointNotFound(t *testing.T) {
	fs := &fakeStore{reviewErr: store.ErrNotFound}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/points/"+sampleUUID+"/reviews",
		`{"profile":"blind","stars":3}`))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}
