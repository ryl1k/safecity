// Package auth verifies Supabase bearer JWTs and carries the caller's identity
// through the request context.
//
// Supabase signs user sessions with asymmetric keys (ES256/RS256) published at
// the project JWKS endpoint (confirmed by the spike). We verify the signature
// against that key set, enforce issuer + expiry, and pull the user id (sub) out
// of the token. The application role (user/trusted/moderator) lives in the
// profiles table, not the token, so it is resolved separately (see middleware).
package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

// Principal is an authenticated caller extracted from a verified JWT.
type Principal struct {
	UserID string // JWT sub — the Supabase auth user id
	Email  string // optional, from the token
	Role   string // Postgres role claim (typically "authenticated")
	Token  string // raw bearer token, for forwarding if ever needed
}

// Verifier validates bearer tokens against a JWKS key set.
type Verifier struct {
	keyfunc jwt.Keyfunc
	issuer  string
}

type tokenClaims struct {
	jwt.RegisteredClaims
	Email string `json:"email"`
	Role  string `json:"role"`
}

// NewVerifier builds a Verifier that fetches and auto-refreshes the JWKS at
// jwksURL. issuer is the expected `iss` claim (e.g. https://<ref>.supabase.co/auth/v1).
func NewVerifier(ctx context.Context, jwksURL, issuer string) (*Verifier, error) {
	k, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("init jwks from %s: %w", jwksURL, err)
	}
	return &Verifier{keyfunc: k.Keyfunc, issuer: issuer}, nil
}

// NewVerifierWithKeyfunc builds a Verifier from a caller-supplied keyfunc. Used
// by tests to inject a static key without a network round-trip.
func NewVerifierWithKeyfunc(kf jwt.Keyfunc, issuer string) *Verifier {
	return &Verifier{keyfunc: kf, issuer: issuer}
}

// ErrInvalidToken is returned for any token that fails verification.
var ErrInvalidToken = errors.New("invalid token")

// Verify parses and validates a raw bearer token string, returning the caller's
// identity. It enforces an asymmetric signing method, a matching issuer, and a
// non-expired token. Any failure maps to ErrInvalidToken (wrapped).
func (v *Verifier) Verify(raw string) (*Principal, error) {
	var claims tokenClaims
	opts := []jwt.ParserOption{
		jwt.WithValidMethods([]string{"ES256", "RS256"}),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(30 * time.Second),
	}
	if v.issuer != "" {
		opts = append(opts, jwt.WithIssuer(v.issuer))
	}

	tok, err := jwt.ParseWithClaims(raw, &claims, v.keyfunc, opts...)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidToken, err)
	}
	if !tok.Valid {
		return nil, ErrInvalidToken
	}
	if claims.Subject == "" {
		return nil, fmt.Errorf("%w: missing sub", ErrInvalidToken)
	}

	return &Principal{
		UserID: claims.Subject,
		Email:  claims.Email,
		Role:   claims.Role,
		Token:  raw,
	}, nil
}
