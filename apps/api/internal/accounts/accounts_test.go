package accounts

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestCreateUserOK(t *testing.T) {
	var gotAuth, gotKey string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/admin/users" {
			t.Errorf("path = %s", r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		gotKey = r.Header.Get("apikey")
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	c := New(srv.URL, "svc-key", time.Second)
	if err := c.CreateUser(context.Background(), "a@b.io", "password123"); err != nil {
		t.Fatal(err)
	}
	if gotAuth != "Bearer svc-key" || gotKey != "svc-key" {
		t.Errorf("auth headers: %q / %q", gotAuth, gotKey)
	}
	if gotBody["email_confirm"] != true {
		t.Errorf("email_confirm missing: %v", gotBody)
	}
}

func TestCreateUserExists(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{"msg":"A user with this email address has already been registered"}`))
	}))
	defer srv.Close()

	c := New(srv.URL, "svc-key", time.Second)
	if err := c.CreateUser(context.Background(), "a@b.io", "password123"); !errors.Is(err, ErrExists) {
		t.Fatalf("want ErrExists, got %v", err)
	}
}

func TestConfigured(t *testing.T) {
	if New("", "", time.Second).Configured() {
		t.Error("empty client should not be configured")
	}
	if !New("https://x.supabase.co", "k", time.Second).Configured() {
		t.Error("full client should be configured")
	}
}
