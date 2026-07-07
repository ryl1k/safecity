package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"strings"

	"github.com/go-playground/validator/v10"
)

// MaxBodyBytes caps request bodies to guard against oversized payloads.
const MaxBodyBytes = 1 << 20 // 1 MiB

var validate = newValidator()

func newValidator() *validator.Validate {
	v := validator.New(validator.WithRequiredStructEnabled())
	// Report the JSON field name (what the client sent), not the Go field name.
	v.RegisterTagNameFunc(func(fld reflect.StructField) string {
		name := strings.SplitN(fld.Tag.Get("json"), ",", 2)[0]
		if name == "-" {
			return ""
		}
		return name
	})
	return v
}

// Decode reads a single JSON object from r into dst, enforcing a body-size limit
// and rejecting unknown fields, then validates dst against its `validate` tags.
// On any failure it writes the appropriate JSON error and returns false; callers
// should simply return when it does.
func Decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	if err := dec.Decode(dst); err != nil {
		Error(w, decodeStatus(err), "invalid_json", decodeMessage(err))
		return false
	}
	if dec.More() {
		Error(w, http.StatusBadRequest, "invalid_json", "body must contain a single JSON object")
		return false
	}

	if err := validate.Struct(dst); err != nil {
		var verrs validator.ValidationErrors
		if errors.As(err, &verrs) {
			ValidationError(w, fieldErrors(verrs))
			return false
		}
		Error(w, http.StatusInternalServerError, "validation_error", "could not validate request")
		return false
	}
	return true
}

func decodeStatus(err error) int {
	var maxErr *http.MaxBytesError
	if errors.As(err, &maxErr) {
		return http.StatusRequestEntityTooLarge
	}
	return http.StatusBadRequest
}

func decodeMessage(err error) string {
	var (
		syntaxErr *json.SyntaxError
		typeErr   *json.UnmarshalTypeError
		maxErr    *http.MaxBytesError
	)
	switch {
	case errors.As(err, &maxErr):
		return fmt.Sprintf("request body must not exceed %d bytes", MaxBodyBytes)
	case errors.As(err, &syntaxErr):
		return fmt.Sprintf("malformed JSON at byte %d", syntaxErr.Offset)
	case errors.As(err, &typeErr):
		return fmt.Sprintf("field %q has the wrong type", typeErr.Field)
	case errors.Is(err, io.EOF):
		return "request body is empty"
	case strings.HasPrefix(err.Error(), "json: unknown field "):
		return "request contains an unknown field: " + strings.TrimPrefix(err.Error(), "json: unknown field ")
	default:
		return "request body is not valid JSON"
	}
}

func fieldErrors(verrs validator.ValidationErrors) []FieldError {
	out := make([]FieldError, 0, len(verrs))
	for _, fe := range verrs {
		out = append(out, FieldError{Field: fe.Field(), Message: ruleMessage(fe)})
	}
	return out
}

func ruleMessage(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return "is required"
	case "email":
		return "must be a valid email address"
	case "url":
		return "must be a valid URL"
	case "uuid", "uuid4":
		return "must be a valid UUID"
	case "min":
		return "must be at least " + fe.Param()
	case "max":
		return "must be at most " + fe.Param()
	case "len":
		return "must be exactly " + fe.Param() + " long"
	case "gte":
		return "must be greater than or equal to " + fe.Param()
	case "lte":
		return "must be less than or equal to " + fe.Param()
	case "oneof":
		return "must be one of: " + fe.Param()
	default:
		return "is invalid"
	}
}
