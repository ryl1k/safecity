package server

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"github.com/safecity/api/internal/accounts"
)

type fakeAccounts struct {
	gotEmail, gotPassword string
	err                   error
}

func (f *fakeAccounts) CreateUser(_ context.Context, email, password string) error {
	f.gotEmail, f.gotPassword = email, password
	return f.err
}

func signupServer(fa AccountService) *Server {
	return New(Deps{Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Accounts: fa})
}

func TestSignupOK(t *testing.T) {
	fa := &fakeAccounts{}
	rec := postJSON(signupServer(fa), "/auth/signup", `{"email":"a@b.io","password":"longenough"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d; body=%s", rec.Code, rec.Body.String())
	}
	if fa.gotEmail != "a@b.io" || fa.gotPassword != "longenough" {
		t.Fatalf("accounts got %q/%q", fa.gotEmail, fa.gotPassword)
	}
}

func TestSignupValidation(t *testing.T) {
	cases := []string{
		`{}`,
		`{"email":"a@b.io"}`,
		`{"email":"a@b.io","password":"short"}`,
		`{"email":"nodomain","password":"longenough"}`,
	}
	for _, body := range cases {
		if rec := postJSON(signupServer(&fakeAccounts{}), "/auth/signup", body); rec.Code != http.StatusBadRequest {
			t.Errorf("body %s: status = %d, want 400", body, rec.Code)
		}
	}
}

func TestSignupExistsConflict(t *testing.T) {
	fa := &fakeAccounts{err: accounts.ErrExists}
	rec := postJSON(signupServer(fa), "/auth/signup", `{"email":"a@b.io","password":"longenough"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "вже існує") {
		t.Fatalf("expected Ukrainian conflict message, got %s", rec.Body.String())
	}
}

func TestSignupDisabledWithoutService(t *testing.T) {
	srv := New(Deps{Log: slog.New(slog.NewTextHandler(io.Discard, nil))})
	if rec := postJSON(srv, "/auth/signup", `{"email":"a@b.io","password":"longenough"}`); rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 when accounts service absent", rec.Code)
	}
}
