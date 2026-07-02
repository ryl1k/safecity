package server

import (
	"context"

	"github.com/safecity/api/internal/geo"
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

	// BarriersInBBox
	barriers    []store.LngLat
	barriersErr error

	// SearchPoints
	gotSearchQ     string
	gotSearchLimit int
	hits           []store.PointHit
	hitsErr        error

	// ReviewsFor / ReviewStats
	gotReviewsPoint string
	reviews         []store.Review
	reviewsErr      error
	stats           []store.ReviewStat
	statsErr        error

	// ListProblems / ProblemsInBBox / ProblemByID
	problems       []store.ProblemListItem
	problemsErr    error
	markers        []store.ProblemMarker
	markersErr     error
	gotProblemID   string
	problemDetail  *store.ProblemDetail
	problemDetErr  error

	// FeatureCatalog
	catalog    []store.Feature
	catalogErr error

	// UpdateProfileNeeds
	gotNeeds   []string
	gotPrimary string
	needsErr   error
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

func (f *fakeStore) BarriersInBBox(_ context.Context, _, _, _, _ float64) ([]store.LngLat, error) {
	return f.barriers, f.barriersErr
}

func (f *fakeStore) SearchPoints(_ context.Context, query string, limit int) ([]store.PointHit, error) {
	f.gotSearchQ, f.gotSearchLimit = query, limit
	return f.hits, f.hitsErr
}

func (f *fakeStore) ReviewsFor(_ context.Context, pointID string) ([]store.Review, error) {
	f.gotReviewsPoint = pointID
	return f.reviews, f.reviewsErr
}

func (f *fakeStore) ReviewStats(_ context.Context) ([]store.ReviewStat, error) {
	return f.stats, f.statsErr
}

func (f *fakeStore) ListProblems(_ context.Context) ([]store.ProblemListItem, error) {
	return f.problems, f.problemsErr
}

func (f *fakeStore) ProblemsInBBox(_ context.Context, _, _, _, _ float64) ([]store.ProblemMarker, error) {
	return f.markers, f.markersErr
}

func (f *fakeStore) ProblemByID(_ context.Context, id string) (*store.ProblemDetail, error) {
	f.gotProblemID = id
	return f.problemDetail, f.problemDetErr
}

func (f *fakeStore) FeatureCatalog(_ context.Context) ([]store.Feature, error) {
	return f.catalog, f.catalogErr
}

func (f *fakeStore) UpdateProfileNeeds(_ context.Context, userID string, needs []string, primary string) error {
	f.gotUser = userID
	f.gotNeeds = needs
	f.gotPrimary = primary
	return f.needsErr
}

// fakeGeo is a configurable GeoService for handler unit tests.
type fakeGeo struct {
	gotRoute geo.RouteInput
	route    geo.RouteResult
	routeErr error

	gotGeoQuery string
	gotGeoLimit int
	places      []geo.Place
	geoErr      error

	gotRevLng float64
	gotRevLat float64
	reverse   *geo.Place
	revErr    error
}

func (f *fakeGeo) Route(_ context.Context, in geo.RouteInput) (geo.RouteResult, error) {
	f.gotRoute = in
	return f.route, f.routeErr
}

func (f *fakeGeo) Geocode(_ context.Context, query string, limit int) ([]geo.Place, error) {
	f.gotGeoQuery = query
	f.gotGeoLimit = limit
	return f.places, f.geoErr
}

func (f *fakeGeo) Reverse(_ context.Context, lng, lat float64) (*geo.Place, error) {
	f.gotRevLng, f.gotRevLat = lng, lat
	return f.reverse, f.revErr
}
