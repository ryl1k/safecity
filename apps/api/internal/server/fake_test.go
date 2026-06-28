package server

import (
	"context"

	"github.com/safecity/api/internal/store"
)

// fakeStore is a configurable DataStore for handler unit tests. Fields capture
// the last call's arguments; *Ret/*Err configure the response.
type fakeStore struct {
	// CreateProblem
	gotUser string
	got     store.NewProblem
	ret     store.Problem
	err     error

	// PointsNear
	gotNearLng, gotNearLat, gotNearRadius float64
	near                                  []store.PointSummary
	nearErr                               error

	// PointsInBBox
	bbox    []store.PointSummary
	bboxErr error

	// PointDetail
	gotDetailID string
	detail      *store.PointDetail
	detailErr   error

	// AddPoint
	gotPoint store.NewPoint
	pointID  string
	pointErr error

	// UpsertReview
	gotReviewPoint string
	gotReview      store.NewReview
	review         store.Review
	reviewErr      error

	// ConfirmProblem
	gotConfirmID string
	confirm      store.ConfirmResult
	confirmErr   error

	// CreatePetition
	gotPetition store.NewPetition
	petition    store.Petition
	petitionErr error

	// SignPetition
	gotSignID string
	sign      store.SignResult
	signErr   error
}

func (f *fakeStore) CreateProblem(_ context.Context, userID string, in store.NewProblem) (store.Problem, error) {
	f.gotUser = userID
	f.got = in
	return f.ret, f.err
}

func (f *fakeStore) PointsNear(_ context.Context, lng, lat, radiusM float64) ([]store.PointSummary, error) {
	f.gotNearLng, f.gotNearLat, f.gotNearRadius = lng, lat, radiusM
	return f.near, f.nearErr
}

func (f *fakeStore) PointsInBBox(_ context.Context, _, _, _, _ float64) ([]store.PointSummary, error) {
	return f.bbox, f.bboxErr
}

func (f *fakeStore) PointDetail(_ context.Context, id string) (*store.PointDetail, error) {
	f.gotDetailID = id
	return f.detail, f.detailErr
}

func (f *fakeStore) AddPoint(_ context.Context, userID string, in store.NewPoint) (string, error) {
	f.gotUser = userID
	f.gotPoint = in
	return f.pointID, f.pointErr
}

func (f *fakeStore) UpsertReview(_ context.Context, userID, pointID string, in store.NewReview) (store.Review, error) {
	f.gotUser = userID
	f.gotReviewPoint = pointID
	f.gotReview = in
	return f.review, f.reviewErr
}

func (f *fakeStore) ConfirmProblem(_ context.Context, userID, problemID string) (store.ConfirmResult, error) {
	f.gotUser = userID
	f.gotConfirmID = problemID
	return f.confirm, f.confirmErr
}

func (f *fakeStore) CreatePetition(_ context.Context, userID string, in store.NewPetition) (store.Petition, error) {
	f.gotUser = userID
	f.gotPetition = in
	return f.petition, f.petitionErr
}

func (f *fakeStore) SignPetition(_ context.Context, userID, petitionID string) (store.SignResult, error) {
	f.gotUser = userID
	f.gotSignID = petitionID
	return f.sign, f.signErr
}
