package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/safecity/api/internal/store"
)

func TestConfirmProblemOK(t *testing.T) {
	fs := &fakeStore{confirm: store.ConfirmResult{Confirmations: 3, Status: "reported"}}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/problems/"+sampleUUID+"/confirm", ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotConfirmID != sampleUUID {
		t.Fatalf("store got id %q", fs.gotConfirmID)
	}
	if !strings.Contains(rec.Body.String(), `"confirmations":3`) {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

func TestConfirmProblemDuplicate(t *testing.T) {
	fs := &fakeStore{confirmErr: store.ErrConflict}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/problems/"+sampleUUID+"/confirm", ""))
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
}

func TestConfirmProblemNotFound(t *testing.T) {
	fs := &fakeStore{confirmErr: store.ErrNotFound}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/problems/"+sampleUUID+"/confirm", ""))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestConfirmProblemBadID(t *testing.T) {
	rec := do(problemServer(&fakeStore{}), authedReq(http.MethodPost, "/problems/nope/confirm", ""))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestConfirmProblemRequiresAuth(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/problems/"+sampleUUID+"/confirm", nil) // no principal
	if rec := do(problemServer(&fakeStore{}), req); rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestCreatePetitionOK(t *testing.T) {
	fs := &fakeStore{petition: store.Petition{ID: "pet-1", Scope: "internal"}}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/petitions",
		`{"problem_id":"`+sampleUUID+`","title":"Fix the ramp"}`))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotPetition.ProblemID != sampleUUID || fs.gotPetition.Scope != "internal" {
		t.Fatalf("store got %+v", fs.gotPetition)
	}
}

func TestCreatePetitionDefaultsScope(t *testing.T) {
	fs := &fakeStore{}
	do(problemServer(fs), authedReq(http.MethodPost, "/petitions", `{"problem_id":"`+sampleUUID+`","title":"Fix it"}`))
	if fs.gotPetition.Scope != "internal" {
		t.Fatalf("scope = %q, want internal default", fs.gotPetition.Scope)
	}
}

func TestCreatePetitionMissingProblemID(t *testing.T) {
	rec := do(problemServer(&fakeStore{}), authedReq(http.MethodPost, "/petitions", `{"title":"Orphan petition"}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestCreatePetitionBadScope(t *testing.T) {
	rec := do(problemServer(&fakeStore{}), authedReq(http.MethodPost, "/petitions",
		`{"problem_id":"`+sampleUUID+`","title":"X","scope":"galaxy"}`))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
}

func TestCreatePetitionProblemNotFound(t *testing.T) {
	fs := &fakeStore{petitionErr: store.ErrNotFound}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/petitions",
		`{"problem_id":"`+sampleUUID+`","title":"Fix it"}`))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestSignPetitionOK(t *testing.T) {
	fs := &fakeStore{sign: store.SignResult{Signatures: 12}}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/petitions/"+sampleUUID+"/sign", ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	if fs.gotSignID != sampleUUID {
		t.Fatalf("store got id %q", fs.gotSignID)
	}
	if !strings.Contains(rec.Body.String(), `"signatures":12`) {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

func TestSignPetitionDuplicate(t *testing.T) {
	fs := &fakeStore{signErr: store.ErrConflict}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/petitions/"+sampleUUID+"/sign", ""))
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
}

func TestSignPetitionNotFound(t *testing.T) {
	fs := &fakeStore{signErr: store.ErrNotFound}
	rec := do(problemServer(fs), authedReq(http.MethodPost, "/petitions/"+sampleUUID+"/sign", ""))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}
