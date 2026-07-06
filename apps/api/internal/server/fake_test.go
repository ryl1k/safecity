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

	// CreateBusinessPoint
	gotBizPoint store.NewPoint
	bizPointID  string
	bizPointErr error

	// MyBusinessPoints
	bizPoints    []store.BusinessPointRow
	bizPointsErr error

	// MarkVerifiedPaid / SetSubscription
	gotVerifyPaidID string
	verifyPaidErr   error
	gotSubID        string
	gotSubPlan      string
	subErr          error

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
	viewerState    store.ProblemViewerState
	viewerStateErr error

	// SegmentsInBBox
	segments    []store.StreetSegment
	segmentsErr error

	// FeatureCatalog
	catalog    []store.Feature
	catalogErr error

	// UpdateProfileNeeds
	gotNeeds   []string
	gotPrimary string
	needsErr   error

	// moderation
	adminPoints    []store.AdminPoint
	adminPointsErr error
	gotVerifyID    string
	gotVerify      string
	verifyErr      error
	gotDeleteID    string
	deleteErr      error
	adminProblems  []store.AdminProblem
	adminProbErr   error
	adminReviews   []store.AdminReview
	adminRevErr    error
	adminUsers     []store.AdminUser
	adminUsersErr  error
	gotRoleID      string
	gotRole        string
	roleErr        error
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

func (f *fakeStore) CreateBusinessPoint(_ context.Context, userID string, in store.NewPoint) (string, error) {
	f.gotUser = userID
	f.gotBizPoint = in
	return f.bizPointID, f.bizPointErr
}

func (f *fakeStore) MyBusinessPoints(_ context.Context, userID string) ([]store.BusinessPointRow, error) {
	f.gotUser = userID
	return f.bizPoints, f.bizPointsErr
}

func (f *fakeStore) MarkVerifiedPaid(_ context.Context, userID, pointID string) error {
	f.gotUser, f.gotVerifyPaidID = userID, pointID
	return f.verifyPaidErr
}

func (f *fakeStore) SetSubscription(_ context.Context, userID, pointID, plan string) error {
	f.gotUser, f.gotSubID, f.gotSubPlan = userID, pointID, plan
	return f.subErr
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

func (f *fakeStore) SegmentsInBBox(_ context.Context, _, _, _, _ float64) ([]store.StreetSegment, error) {
	return f.segments, f.segmentsErr
}

func (f *fakeStore) AddSegment(_ context.Context, _ string, _ store.NewSegment) (string, error) {
	return "", nil
}

func (f *fakeStore) RouteAccessible(_ context.Context, _, _, _, _ float64) (*store.AccessibleRoute, error) {
	return nil, nil
}

func (f *fakeStore) NoneSegmentMidpointsInBBox(_ context.Context, _, _, _, _ float64) ([]store.LngLat, error) {
	return nil, nil
}

func (f *fakeStore) FeatureCatalog(_ context.Context) ([]store.Feature, error) {
	return f.catalog, f.catalogErr
}

func (f *fakeStore) ProblemViewerState(_ context.Context, userID, problemID string) (store.ProblemViewerState, error) {
	f.gotUser = userID
	f.gotProblemID = problemID
	return f.viewerState, f.viewerStateErr
}

func (f *fakeStore) UpdateProfileNeeds(_ context.Context, userID string, needs []string, primary string) error {
	f.gotUser = userID
	f.gotNeeds = needs
	f.gotPrimary = primary
	return f.needsErr
}

func (f *fakeStore) UnverifiedPoints(_ context.Context) ([]store.AdminPoint, error) {
	return f.adminPoints, f.adminPointsErr
}

func (f *fakeStore) SetPointVerify(_ context.Context, userID, pointID, status string) error {
	f.gotUser, f.gotVerifyID, f.gotVerify = userID, pointID, status
	return f.verifyErr
}

func (f *fakeStore) DeletePoint(_ context.Context, userID, pointID string) error {
	f.gotUser, f.gotDeleteID = userID, pointID
	return f.deleteErr
}

func (f *fakeStore) OpenProblems(_ context.Context) ([]store.AdminProblem, error) {
	return f.adminProblems, f.adminProbErr
}

func (f *fakeStore) ResolveProblem(_ context.Context, userID, problemID string) error {
	f.gotUser, f.gotVerifyID = userID, problemID
	return f.verifyErr
}

func (f *fakeStore) DeleteProblem(_ context.Context, userID, problemID string) error {
	f.gotUser, f.gotDeleteID = userID, problemID
	return f.deleteErr
}

func (f *fakeStore) RecentReviews(_ context.Context, _ int) ([]store.AdminReview, error) {
	return f.adminReviews, f.adminRevErr
}

func (f *fakeStore) DeleteReview(_ context.Context, userID, reviewID string) error {
	f.gotUser, f.gotDeleteID = userID, reviewID
	return f.deleteErr
}

func (f *fakeStore) ListUsers(_ context.Context, _ int) ([]store.AdminUser, error) {
	return f.adminUsers, f.adminUsersErr
}

func (f *fakeStore) SetUserRole(_ context.Context, userID, targetID, role string) error {
	f.gotUser, f.gotRoleID, f.gotRole = userID, targetID, role
	return f.roleErr
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
