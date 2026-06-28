package httpx

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type sample struct {
	Name string `json:"name" validate:"required,min=2"`
	Age  int    `json:"age" validate:"gte=0,lte=120"`
}

func decodeReq(body string) (*httptest.ResponseRecorder, *sample, bool) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	var dst sample
	ok := Decode(rec, req, &dst)
	return rec, &dst, ok
}

func TestDecodeValid(t *testing.T) {
	rec, dst, ok := decodeReq(`{"name":"Lviv","age":3}`)
	if !ok {
		t.Fatalf("expected ok; body=%s", rec.Body.String())
	}
	if dst.Name != "Lviv" || dst.Age != 3 {
		t.Fatalf("decoded = %+v", dst)
	}
}

func TestDecodeUnknownField(t *testing.T) {
	rec, _, ok := decodeReq(`{"name":"Lviv","oops":1}`)
	if ok {
		t.Fatal("expected failure on unknown field")
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestDecodeMalformed(t *testing.T) {
	rec, _, ok := decodeReq(`{not json`)
	if ok || rec.Code != http.StatusBadRequest {
		t.Fatalf("ok=%v status=%d, want false/400", ok, rec.Code)
	}
}

func TestDecodeEmptyBody(t *testing.T) {
	rec, _, ok := decodeReq(``)
	if ok || rec.Code != http.StatusBadRequest {
		t.Fatalf("ok=%v status=%d, want false/400", ok, rec.Code)
	}
}

func TestDecodeTrailingData(t *testing.T) {
	rec, _, ok := decodeReq(`{"name":"Lviv","age":3}{"name":"x","age":1}`)
	if ok || rec.Code != http.StatusBadRequest {
		t.Fatalf("ok=%v status=%d, want false/400 on trailing data", ok, rec.Code)
	}
}

func TestDecodeTooLarge(t *testing.T) {
	big := `{"name":"` + strings.Repeat("a", MaxBodyBytes+100) + `","age":3}`
	rec, _, ok := decodeReq(big)
	if ok || rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("ok=%v status=%d, want false/413", ok, rec.Code)
	}
}

func TestDecodeValidationFailure(t *testing.T) {
	rec, _, ok := decodeReq(`{"name":"","age":999}`)
	if ok {
		t.Fatal("expected validation failure")
	}
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"code":"validation_failed"`) {
		t.Fatalf("missing code in %s", body)
	}
	// Both fields should be reported.
	if !strings.Contains(body, `"field":"name"`) || !strings.Contains(body, `"field":"age"`) {
		t.Fatalf("expected name+age field errors in %s", body)
	}
}

func TestErrorEnvelopeShape(t *testing.T) {
	rec := httptest.NewRecorder()
	Error(rec, http.StatusTeapot, "im_a_teapot", "short and stout")
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("content-type = %q", ct)
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"error":{"code":"im_a_teapot","message":"short and stout"}`) {
		t.Fatalf("unexpected envelope: %s", body)
	}
}
