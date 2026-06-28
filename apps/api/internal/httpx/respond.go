// Package httpx provides a consistent JSON response/error shape and request
// decoding+validation shared by all handlers.
//
// Every error the API returns has the same envelope:
//
//	{"error": {"code": "invalid_json", "message": "...", "fields": [...]}}
//
// so the web client can branch on a stable machine-readable code.
package httpx

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// FieldError describes one invalid request field.
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ErrorBody is the payload under the "error" key.
type ErrorBody struct {
	Code    string       `json:"code"`
	Message string       `json:"message"`
	Fields  []FieldError `json:"fields,omitempty"`
}

type errorEnvelope struct {
	Error ErrorBody `json:"error"`
}

// JSON writes v as a JSON response with the given status.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("httpx: encode response", "err", err)
	}
}

// Error writes the standard error envelope.
func Error(w http.ResponseWriter, status int, code, message string) {
	JSON(w, status, errorEnvelope{Error: ErrorBody{Code: code, Message: message}})
}

// ValidationError writes a 422 with per-field details.
func ValidationError(w http.ResponseWriter, fields []FieldError) {
	JSON(w, http.StatusUnprocessableEntity, errorEnvelope{Error: ErrorBody{
		Code:    "validation_failed",
		Message: "request validation failed",
		Fields:  fields,
	}})
}
