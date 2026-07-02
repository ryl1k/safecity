package server

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"github.com/safecity/api/internal/store"
)

// adminServer wires a role resolver so /admin routes are mounted.
func adminServer(fs DataStore, role string) *Server {
	return New(Deps{
		Log:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		Store: fs,
		Roles: func(_ context.Context, _ string) (string, error) { return role, nil },
	})
}

func TestAdminRequiresAuth(t *testing.T) {
	req := authedReq(http.MethodGet, "/admin/points/unverified", "")
	// authenticated but plain user → 403
	if rec := do(adminServer(&fakeStore{}, "user"), req); rec.Code != http.StatusForbidden {
		t.Fatalf("user role: status = %d, want 403", rec.Code)
	}
	// anonymous → 401
	rec := get(adminServer(&fakeStore{}, "moderator"), "/admin/points/unverified")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("anon: status = %d, want 401", rec.Code)
	}
}

func TestAdminUnverifiedPoints(t *testing.T) {
	fs := &fakeStore{adminPoints: []store.AdminPoint{{ID: "p1", Name: "Кафе"}}}
	rec := do(adminServer(fs, "moderator"), authedReq(http.MethodGet, "/admin/points/unverified", ""))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"name":"Кафе"`) {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestAdminSetPointVerify(t *testing.T) {
	fs := &fakeStore{}
	rec := do(adminServer(fs, "moderator"),
		authedReq(http.MethodPost, "/admin/points/"+sampleUUID+"/verify", `{"status":"verified"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotVerifyID != sampleUUID || fs.gotVerify != "verified" || fs.gotUser != "u1" {
		t.Fatalf("store got %q/%q/%q", fs.gotVerifyID, fs.gotVerify, fs.gotUser)
	}
	// invalid status rejected by validation
	rec = do(adminServer(&fakeStore{}, "moderator"),
		authedReq(http.MethodPost, "/admin/points/"+sampleUUID+"/verify", `{"status":"bogus"}`))
	if rec.Code != http.StatusBadRequest && rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("bad status accepted: %d", rec.Code)
	}
}

func TestAdminDeletePointNotFound(t *testing.T) {
	fs := &fakeStore{deleteErr: store.ErrNotFound}
	rec := do(adminServer(fs, "moderator"), authedReq(http.MethodDelete, "/admin/points/"+sampleUUID, ""))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestAdminResolveProblem(t *testing.T) {
	fs := &fakeStore{}
	rec := do(adminServer(fs, "moderator"),
		authedReq(http.MethodPost, "/admin/problems/"+sampleUUID+"/resolve", ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
}

func TestAdminSetUserRole(t *testing.T) {
	fs := &fakeStore{}
	rec := do(adminServer(fs, "moderator"),
		authedReq(http.MethodPost, "/admin/users/"+sampleUUID+"/role", `{"role":"trusted"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotRoleID != sampleUUID || fs.gotRole != "trusted" {
		t.Fatalf("store got %q/%q", fs.gotRoleID, fs.gotRole)
	}
}

func TestAdminReviewsAndUsersLists(t *testing.T) {
	fs := &fakeStore{
		adminReviews: []store.AdminReview{{ID: "r1", Stars: 1}},
		adminUsers:   []store.AdminUser{{ID: "u9", Role: "user"}},
	}
	srv := adminServer(fs, "moderator")
	if rec := do(srv, authedReq(http.MethodGet, "/admin/reviews?limit=10", "")); rec.Code != http.StatusOK {
		t.Fatalf("reviews status = %d", rec.Code)
	}
	if rec := do(srv, authedReq(http.MethodGet, "/admin/users", "")); rec.Code != http.StatusOK {
		t.Fatalf("users status = %d", rec.Code)
	}
}
