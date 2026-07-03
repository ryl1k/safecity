package server

import (
	"net/http"
	"strings"
	"testing"

	"github.com/safecity/api/internal/store"
)

const testUUID = "11111111-2222-3333-4444-555555555555"

func TestPointsSearchOK(t *testing.T) {
	fs := &fakeStore{hits: []store.PointHit{{ID: "p1", Name: "Аптека"}}}
	rec := get(pointServer(fs), "/points/search?q=апт&limit=3")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotSearchQ != "апт" || fs.gotSearchLimit != 3 {
		t.Fatalf("store got %q/%d", fs.gotSearchQ, fs.gotSearchLimit)
	}
	if !strings.Contains(rec.Body.String(), `"name":"Аптека"`) {
		t.Fatalf("missing hit: %s", rec.Body.String())
	}
}

func TestPointsSearchShortQueryReturnsEmpty(t *testing.T) {
	fs := &fakeStore{}
	rec := get(pointServer(fs), "/points/search?q=а")
	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Fatalf("short query: status=%d body=%q", rec.Code, rec.Body.String())
	}
	if fs.gotSearchQ != "" {
		t.Fatal("store should not be queried for short input")
	}
}

func TestPointReviewsOK(t *testing.T) {
	fs := &fakeStore{reviews: []store.Review{{ID: "r1", Stars: 4}}}
	rec := get(pointServer(fs), "/points/"+testUUID+"/reviews")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotReviewsPoint != testUUID {
		t.Fatalf("store got id %q", fs.gotReviewsPoint)
	}
}

func TestPointReviewsBadID(t *testing.T) {
	if rec := get(pointServer(&fakeStore{}), "/points/not-a-uuid/reviews"); rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestReviewStatsOK(t *testing.T) {
	fs := &fakeStore{stats: []store.ReviewStat{{PointID: "p1", Avg: 4.5, Count: 2}}}
	rec := get(pointServer(fs), "/reviews/stats")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"avg":4.5`) {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestListProblemsOK(t *testing.T) {
	fs := &fakeStore{problems: []store.ProblemListItem{{ID: "pr1", Title: "Бордюр"}}}
	rec := get(pointServer(fs), "/problems")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"title":"Бордюр"`) {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestProblemsBBoxValidatesParams(t *testing.T) {
	if rec := get(pointServer(&fakeStore{}), "/problems/bbox?min_lng=1"); rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	fs := &fakeStore{markers: []store.ProblemMarker{{ID: "m1"}}}
	rec := get(pointServer(fs), "/problems/bbox?min_lng=24.0&min_lat=49.8&max_lng=24.1&max_lat=49.9")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
}

func TestProblemDetailNotFound(t *testing.T) {
	if rec := get(pointServer(&fakeStore{}), "/problems/"+testUUID); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestProblemDetailOK(t *testing.T) {
	fs := &fakeStore{problemDetail: &store.ProblemDetail{
		Problem:  store.ProblemListItem{ID: "pr1", Title: "Сходи без пандуса"},
		Petition: &store.PetitionDetail{ID: "pe1", Title: "Пандус"},
	}}
	rec := get(pointServer(fs), "/problems/"+testUUID)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"problem"`) || !strings.Contains(body, `"petition"`) {
		t.Fatalf("payload shape wrong: %s", body)
	}
}

func TestProblemViewerState(t *testing.T) {
	// anonymous → 401
	if rec := get(pointServer(&fakeStore{}), "/problems/"+testUUID+"/me"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("anon status = %d, want 401", rec.Code)
	}
	fs := &fakeStore{viewerState: store.ProblemViewerState{Confirmed: true, Signed: false}}
	rec := do(pointServer(fs), authedReq(http.MethodGet, "/problems/"+testUUID+"/me", ""))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"confirmed":true`) {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotProblemID != testUUID || fs.gotUser != "u1" {
		t.Fatalf("store got %q/%q", fs.gotProblemID, fs.gotUser)
	}
}

func TestFeatureCatalogOK(t *testing.T) {
	fs := &fakeStore{catalog: []store.Feature{{Key: "ramp", Label: "Пандус"}}}
	rec := get(pointServer(fs), "/catalog/features")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"key":"ramp"`) {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "max-age=3600") {
		t.Fatalf("catalog cache header = %q", cc)
	}
}
