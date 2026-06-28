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
