package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/safecity/api/internal/store"
)

func TestSubscribeBusinessRequiresAuth(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/business/subscribe", strings.NewReader(`{"plan":"monthly"}`))
	if rec := do(problemServer(&fakeStore{}), req); rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestSubscribeBusinessOK(t *testing.T) {
	fs := &fakeStore{}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/business/subscribe", `{"plan":"yearly"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotUser != "u1" || fs.gotSubPlan != "yearly" {
		t.Fatalf("store got user=%q plan=%q", fs.gotUser, fs.gotSubPlan)
	}
}

func TestSubscribeBusinessBadPlan(t *testing.T) {
	rec := do(problemServer(&fakeStore{}), authedReq(http.MethodPost, "/business/subscribe", `{"plan":"weekly"}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestBusinessMeRequiresAuth(t *testing.T) {
	rec := get(problemServer(&fakeStore{}), "/business/me")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestBusinessMeOK(t *testing.T) {
	fs := &fakeStore{bizMe: store.BusinessMe{
		IsBusiness: true,
		Points:     []store.MyPoint{{ID: "p1", Name: "Кав'ярня", Category: "venue"}},
	}}
	rec := do(problemServer(fs), authedReq(http.MethodGet, "/business/me", ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotUser != "u1" {
		t.Fatalf("store got user %q, want u1", fs.gotUser)
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"isBusiness":true`) || !strings.Contains(body, `"name":"Кав'ярня"`) {
		t.Fatalf("unexpected body: %s", body)
	}
}

// A non-business user hitting the 10-point cap gets a 409 point_limit — the only
// place the limit is ever surfaced.
func TestAddPointLimitReached(t *testing.T) {
	fs := &fakeStore{pointErr: store.ErrPointLimit}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/points",
		`{"name":"Valid Name","category":"venue","lat":49.8,"lng":24.0}`))
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"point_limit"`) {
		t.Fatalf("expected point_limit code: %s", rec.Body.String())
	}
}
