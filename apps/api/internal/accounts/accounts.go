// Package accounts wraps the Supabase Auth admin API for server-side account
// operations (the service key never leaves the API).
package accounts

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// ErrExists means an account with this email is already registered.
var ErrExists = errors.New("user already exists")

// Client talks to the Supabase Auth admin endpoints.
type Client struct {
	http   *http.Client
	base   string // project URL, e.g. https://<ref>.supabase.co
	secret string // service key
}

// New builds a Client. timeout bounds each upstream call.
func New(base, secret string, timeout time.Duration) *Client {
	return &Client{
		http:   &http.Client{Timeout: timeout},
		base:   strings.TrimRight(base, "/"),
		secret: strings.TrimSpace(secret),
	}
}

// Configured reports whether the admin client has credentials.
func (c *Client) Configured() bool { return c.base != "" && c.secret != "" }

var existsRe = regexp.MustCompile(`(?i)already|registered|exists`)

// CreateUser registers a confirmed account (email_confirm sidesteps the
// project's email-confirmation flow so accounts are usable instantly).
// Returns ErrExists when the email is taken.
func (c *Client) CreateUser(ctx context.Context, email, password string) error {
	body, err := json.Marshal(map[string]any{
		"email":         email,
		"password":      password,
		"email_confirm": true,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/auth/v1/admin/users", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.secret)
	req.Header.Set("apikey", c.secret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("supabase admin request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
		return nil
	}

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	var e struct {
		Msg      string `json:"msg"`
		Message  string `json:"message"`
		ErrorMsg string `json:"error_description"`
	}
	_ = json.Unmarshal(raw, &e)
	msg := e.Msg
	if msg == "" {
		msg = e.Message
	}
	if msg == "" {
		msg = e.ErrorMsg
	}
	if resp.StatusCode == http.StatusUnprocessableEntity || existsRe.MatchString(msg) {
		return ErrExists
	}
	return fmt.Errorf("supabase admin status %d: %s", resp.StatusCode, msg)
}
