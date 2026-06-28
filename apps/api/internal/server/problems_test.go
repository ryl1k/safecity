package server

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/safecity/api/internal/auth"
	"github.com/safecity/api/internal/store"
)

type fakeStore struct {
	gotUser string
	got     store.NewProblem
	ret     store.Problem
	err     error
}

func (f *fakeStore) CreateProblem(_ context.Context, userID string, in store.NewProblem) (store.Problem, error) {
	f.gotUser = userID
	f.got = in
	return f.ret, f.err
}

func problemServer(fs DataStore) *Server {
	return New(Deps{Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Store: fs})
}

func postProblem(srv *Server, body string, authed bool) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/problems", strings.NewReader(body))
	if authed {
		req = req.WithContext(auth.WithPrincipal(req.Context(), &auth.Principal{UserID: "u1"}))
	}
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func TestCreateProblemRequiresAuth(t *testing.T) {
	rec := postProblem(problemServer(&fakeStore{}), `{"title":"Broken ramp","point_id":"5f9b1c1e-2c2a-4e1a-8b3a-2b6b7c8d9e0f"}`, false)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestCreateProblemWithPoint(t *testing.T) {
	fs := &fakeStore{ret: store.Problem{ID: "new-id"}}
	rec := postProblem(problemServer(fs),
		`{"title":"Broken ramp","description":"steep","category":"venue","severity":2,"point_id":"5f9b1c1e-2c2a-4e1a-8b3a-2b6b7c8d9e0f"}`, true)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotUser != "u1" {
		t.Fatalf("store got user %q, want u1", fs.gotUser)
	}
	if fs.got.Title != "Broken ramp" || fs.got.Severity != 2 || fs.got.Category != "venue" {
		t.Fatalf("store got %+v", fs.got)
	}
	if !strings.Contains(rec.Body.String(), `"id":"new-id"`) {
		t.Fatalf("response missing id: %s", rec.Body.String())
	}
}

func TestCreateProblemWithPin(t *testing.T) {
	fs := &fakeStore{}
	rec := postProblem(problemServer(fs), `{"title":"Blocked crossing","lat":49.84,"lng":24.03}`, true)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	if fs.got.Lat == nil || fs.got.Lng == nil || *fs.got.Lat != 49.84 || *fs.got.Lng != 24.03 {
		t.Fatalf("store got lat/lng %v/%v", fs.got.Lat, fs.got.Lng)
	}
	if fs.got.Severity != 1 { // defaulted
		t.Fatalf("severity = %d, want default 1", fs.got.Severity)
	}
}

func TestCreateProblemMissingTitle(t *testing.T) {
	rec := postProblem(problemServer(&fakeStore{}), `{"point_id":"5f9b1c1e-2c2a-4e1a-8b3a-2b6b7c8d9e0f"}`, true)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestCreateProblemNeitherTargetNorPin(t *testing.T) {
	rec := postProblem(problemServer(&fakeStore{}), `{"title":"Floating problem"}`, true)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422; body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"field":"point_id"`) {
		t.Fatalf("expected point_id field error: %s", rec.Body.String())
	}
}

func TestCreateProblemBadSeverity(t *testing.T) {
	rec := postProblem(problemServer(&fakeStore{}), `{"title":"Too severe","severity":9,"lat":49.84,"lng":24.03}`, true)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestCreateProblemStoreError(t *testing.T) {
	fs := &fakeStore{err: context.DeadlineExceeded}
	rec := postProblem(problemServer(fs), `{"title":"Broken ramp","lat":49.84,"lng":24.03}`, true)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
}
