package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/safecity/api/internal/store"
)

func TestCreateBusinessPointRequiresAuth(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/business/points", strings.NewReader(`{"name":"X","category":"venue","lat":49.8,"lng":24.0}`))
	if rec := do(problemServer(&fakeStore{}), req); rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestCreateBusinessPointOK(t *testing.T) {
	fs := &fakeStore{bizPointID: "biz-1"}
	body := `{"name":"Кав'ярня","category":"venue","lat":49.8419,"lng":24.0316,"address":"Rynok 1"}`
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/business/points", body))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotUser != "u1" || fs.gotBizPoint.Name != "Кав'ярня" || fs.gotBizPoint.Category != "venue" {
		t.Fatalf("store got %+v (user %q)", fs.gotBizPoint, fs.gotUser)
	}
	if !strings.Contains(rec.Body.String(), `"id":"biz-1"`) {
		t.Fatalf("missing id: %s", rec.Body.String())
	}
}

func TestCreateBusinessPointMissingName(t *testing.T) {
	rec := do(problemServer(&fakeStore{}), authedReq(http.MethodPost, "/business/points", `{"category":"venue","lat":49.8,"lng":24.0}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestCreateBusinessPointUnknownFeatureKey(t *testing.T) {
	fs := &fakeStore{bizPointErr: store.ErrNotFound}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/business/points",
		`{"name":"Valid Name","category":"venue","lat":49.8,"lng":24.0,"features":{"bogus":"yes"}}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"field":"features"`) {
		t.Fatalf("expected features field error: %s", rec.Body.String())
	}
}

func TestMyBusinessPointsRequiresAuth(t *testing.T) {
	rec := get(problemServer(&fakeStore{}), "/business/points/me")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestMyBusinessPointsOK(t *testing.T) {
	fs := &fakeStore{bizPoints: []store.BusinessPointRow{{PointID: "p1", Name: "Кав'ярня", SubscriptionStatus: "none"}}}
	rec := do(problemServer(fs), authedReq(http.MethodGet, "/business/points/me", ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotUser != "u1" {
		t.Fatalf("store got user %q, want u1", fs.gotUser)
	}
	if !strings.Contains(rec.Body.String(), `"name":"Кав'ярня"`) {
		t.Fatalf("missing point: %s", rec.Body.String())
	}
}

func TestVerifyBusinessPaymentOK(t *testing.T) {
	fs := &fakeStore{}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/business/points/"+sampleUUID+"/verify-payment", ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotVerifyPaidID != sampleUUID || fs.gotUser != "u1" {
		t.Fatalf("store got %q/%q", fs.gotVerifyPaidID, fs.gotUser)
	}
}

func TestVerifyBusinessPaymentBadID(t *testing.T) {
	rec := do(problemServer(&fakeStore{}), authedReq(http.MethodPost, "/business/points/not-a-uuid/verify-payment", ""))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestVerifyBusinessPaymentNotFound(t *testing.T) {
	fs := &fakeStore{verifyPaidErr: store.ErrNotFound}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/business/points/"+sampleUUID+"/verify-payment", ""))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestSubscribeBusinessPointOK(t *testing.T) {
	fs := &fakeStore{}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/business/points/"+sampleUUID+"/subscribe", `{"plan":"monthly"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotSubID != sampleUUID || fs.gotSubPlan != "monthly" || fs.gotUser != "u1" {
		t.Fatalf("store got %q/%q/%q", fs.gotSubID, fs.gotSubPlan, fs.gotUser)
	}
}

func TestSubscribeBusinessPointBadPlan(t *testing.T) {
	rec := do(problemServer(&fakeStore{}), authedReq(http.MethodPost, "/business/points/"+sampleUUID+"/subscribe", `{"plan":"weekly"}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestSubscribeBusinessPointNotFound(t *testing.T) {
	fs := &fakeStore{subErr: store.ErrNotFound}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/business/points/"+sampleUUID+"/subscribe", `{"plan":"yearly"}`))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}
