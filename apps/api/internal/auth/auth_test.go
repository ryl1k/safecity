package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testIssuer = "https://ref.supabase.co/auth/v1"

func newKey(t *testing.T) *ecdsa.PrivateKey {
	t.Helper()
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("genkey: %v", err)
	}
	return k
}

// verifierFor returns a Verifier that trusts pub's public key.
func verifierFor(priv *ecdsa.PrivateKey) *Verifier {
	kf := func(*jwt.Token) (any, error) { return &priv.PublicKey, nil }
	return NewVerifierWithKeyfunc(kf, testIssuer)
}

func sign(t *testing.T, priv *ecdsa.PrivateKey, method jwt.SigningMethod, claims jwt.MapClaims) string {
	t.Helper()
	s, err := jwt.NewWithClaims(method, claims).SignedString(priv)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return s
}

func validClaims() jwt.MapClaims {
	return jwt.MapClaims{
		"sub":   "user-123",
		"iss":   testIssuer,
		"role":  "authenticated",
		"email": "a@b.com",
		"exp":   time.Now().Add(time.Hour).Unix(),
	}
}

func TestVerifyValid(t *testing.T) {
	priv := newKey(t)
	tok := sign(t, priv, jwt.SigningMethodES256, validClaims())

	p, err := verifierFor(priv).Verify(tok)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if p.UserID != "user-123" || p.Role != "authenticated" || p.Email != "a@b.com" {
		t.Fatalf("principal = %+v", p)
	}
	if p.Token != tok {
		t.Fatal("raw token not preserved")
	}
}

func TestVerifyExpired(t *testing.T) {
	priv := newKey(t)
	c := validClaims()
	c["exp"] = time.Now().Add(-time.Hour).Unix()
	tok := sign(t, priv, jwt.SigningMethodES256, c)

	if _, err := verifierFor(priv).Verify(tok); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("expected ErrInvalidToken, got %v", err)
	}
}

func TestVerifyWrongIssuer(t *testing.T) {
	priv := newKey(t)
	c := validClaims()
	c["iss"] = "https://evil.example/auth/v1"
	tok := sign(t, priv, jwt.SigningMethodES256, c)

	if _, err := verifierFor(priv).Verify(tok); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("expected ErrInvalidToken, got %v", err)
	}
}

func TestVerifyBadSignature(t *testing.T) {
	signer := newKey(t)
	trusted := newKey(t) // verifier trusts a different key
	tok := sign(t, signer, jwt.SigningMethodES256, validClaims())

	if _, err := verifierFor(trusted).Verify(tok); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("expected ErrInvalidToken, got %v", err)
	}
}

func TestVerifyRejectsHS256(t *testing.T) {
	priv := newKey(t)
	// alg-confusion attempt: HS256 token must be rejected before keyfunc runs.
	hs, err := jwt.NewWithClaims(jwt.SigningMethodHS256, validClaims()).SignedString([]byte("secret"))
	if err != nil {
		t.Fatalf("sign hs: %v", err)
	}
	if _, err := verifierFor(priv).Verify(hs); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("expected ErrInvalidToken, got %v", err)
	}
}

func TestVerifyMissingSub(t *testing.T) {
	priv := newKey(t)
	c := validClaims()
	delete(c, "sub")
	tok := sign(t, priv, jwt.SigningMethodES256, c)

	if _, err := verifierFor(priv).Verify(tok); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("expected ErrInvalidToken, got %v", err)
	}
}

// ── middleware ───────────────────────────────────────────────────────────────

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
}

func TestAuthenticateGuestPassesThrough(t *testing.T) {
	priv := newKey(t)
	var sawPrincipal bool
	h := Authenticate(verifierFor(priv))(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		_, sawPrincipal = PrincipalFrom(r.Context())
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (guest read)", rec.Code)
	}
	if sawPrincipal {
		t.Fatal("guest request should have no principal")
	}
}

func TestAuthenticateValidAttachesPrincipal(t *testing.T) {
	priv := newKey(t)
	tok := sign(t, priv, jwt.SigningMethodES256, validClaims())
	var gotID string
	h := Authenticate(verifierFor(priv))(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		if p, ok := PrincipalFrom(r.Context()); ok {
			gotID = p.UserID
		}
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	h.ServeHTTP(httptest.NewRecorder(), req)
	if gotID != "user-123" {
		t.Fatalf("principal id = %q, want user-123", gotID)
	}
}

func TestAuthenticateInvalidRejected(t *testing.T) {
	priv := newKey(t)
	h := Authenticate(verifierFor(priv))(okHandler())
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer not-a-jwt")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestRequireUser(t *testing.T) {
	h := RequireUser(okHandler())

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("guest status = %d, want 401", rec.Code)
	}

	rec = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = req.WithContext(WithPrincipal(req.Context(), &Principal{UserID: "u1"}))
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("authed status = %d, want 200", rec.Code)
	}
}

func TestRequireRole(t *testing.T) {
	resolveMod := func(context.Context, string) (string, error) { return "moderator", nil }
	resolveUser := func(context.Context, string) (string, error) { return "user", nil }
	resolveErr := func(context.Context, string) (string, error) { return "", errors.New("db down") }

	withUser := func(req *http.Request) *http.Request {
		return req.WithContext(WithPrincipal(req.Context(), &Principal{UserID: "u1"}))
	}

	cases := []struct {
		name    string
		resolve RoleResolver
		authed  bool
		want    int
	}{
		{"guest", resolveMod, false, http.StatusUnauthorized},
		{"moderator allowed", resolveMod, true, http.StatusOK},
		{"user forbidden", resolveUser, true, http.StatusForbidden},
		{"resolver error", resolveErr, true, http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := RequireRole(tc.resolve, "moderator")(okHandler())
			req := httptest.NewRequest(http.MethodPost, "/admin", nil)
			if tc.authed {
				req = withUser(req)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d", rec.Code, tc.want)
			}
		})
	}
}
