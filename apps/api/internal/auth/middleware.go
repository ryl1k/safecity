package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

type contextKey int

const principalKey contextKey = iota

// WithPrincipal returns a copy of ctx carrying p.
func WithPrincipal(ctx context.Context, p *Principal) context.Context {
	return context.WithValue(ctx, principalKey, p)
}

// PrincipalFrom returns the authenticated caller in ctx, if any.
func PrincipalFrom(ctx context.Context) (*Principal, bool) {
	p, ok := ctx.Value(principalKey).(*Principal)
	return p, ok && p != nil
}

// RoleResolver looks up a user's application role (user/trusted/moderator),
// typically from the profiles table. Kept as a func so the auth package stays
// decoupled from the db layer.
type RoleResolver func(ctx context.Context, userID string) (string, error)

// Authenticate is guest-friendly: a request with no bearer token passes through
// unauthenticated (public reads stay open). A token that is present but invalid
// is rejected with 401, so callers cannot fall back to anonymous by sending junk.
func Authenticate(v *Verifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, ok := bearer(r)
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			p, err := v.Verify(raw)
			if err != nil {
				writeErr(w, http.StatusUnauthorized, "invalid or expired token")
				return
			}
			next.ServeHTTP(w, r.WithContext(WithPrincipal(r.Context(), p)))
		})
	}
}

// RequireUser rejects requests without an authenticated caller (writes need a
// valid token). Place it after Authenticate.
func RequireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := PrincipalFrom(r.Context()); !ok {
			writeErr(w, http.StatusUnauthorized, "authentication required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireRole gates a route to callers whose application role is in allowed. It
// resolves the role via resolve (e.g. profiles.role). Unauthenticated → 401,
// resolver failure → 500, insufficient role → 403.
func RequireRole(resolve RoleResolver, allowed ...string) func(http.Handler) http.Handler {
	allow := make(map[string]struct{}, len(allowed))
	for _, a := range allowed {
		allow[a] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := PrincipalFrom(r.Context())
			if !ok {
				writeErr(w, http.StatusUnauthorized, "authentication required")
				return
			}
			role, err := resolve(r.Context(), p.UserID)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "could not resolve role")
				return
			}
			if _, allowed := allow[role]; !allowed {
				writeErr(w, http.StatusForbidden, "insufficient permissions")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func bearer(r *http.Request) (string, bool) {
	h := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(h) <= len(prefix) || !strings.EqualFold(h[:len(prefix)], prefix) {
		return "", false
	}
	tok := strings.TrimSpace(h[len(prefix):])
	return tok, tok != ""
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
