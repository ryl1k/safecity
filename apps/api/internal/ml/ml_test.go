package ml

import (
	"context"
	"errors"
	"net"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"

	"github.com/safecity/api/internal/mlpb"
)

// fakeServer is an in-process MLService for testing the client over real gRPC.
type fakeServer struct {
	mlpb.UnimplementedMLServiceServer
	moderateErr error
	inferErr    error
}

func (f *fakeServer) ModeratePhoto(_ context.Context, req *mlpb.ModeratePhotoRequest) (*mlpb.ModeratePhotoResponse, error) {
	if f.moderateErr != nil {
		return nil, f.moderateErr
	}
	return &mlpb.ModeratePhotoResponse{Approved: true, NsfwScore: 0.01, Labels: []string{"safe"}}, nil
}

func (f *fakeServer) DescribeScene(_ context.Context, req *mlpb.DescribeSceneRequest) (*mlpb.DescribeSceneResponse, error) {
	return &mlpb.DescribeSceneResponse{Description: "a ramp at the entrance", OcrText: "ВХІД", Confidence: 0.8}, nil
}

func (f *fakeServer) InferFeatures(_ context.Context, req *mlpb.InferFeaturesRequest) (*mlpb.InferFeaturesResponse, error) {
	if f.inferErr != nil {
		return nil, f.inferErr
	}
	return &mlpb.InferFeaturesResponse{Features: []*mlpb.FeaturePrediction{
		{Key: "step_free_entrance", Value: "yes", Confidence: 0.9},
	}}, nil
}

// dialFake starts an in-process gRPC server and returns a connected Client.
func dialFake(t *testing.T, srv *fakeServer) *Client {
	t.Helper()
	lis := bufconn.Listen(1 << 20)
	s := grpc.NewServer()
	mlpb.RegisterMLServiceServer(s, srv)
	go func() { _ = s.Serve(lis) }()

	conn, err := grpc.NewClient("passthrough:///bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) { return lis.DialContext(ctx) }),
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() {
		_ = conn.Close()
		s.Stop()
	})
	return NewFromConn(conn)
}

func ctx(t *testing.T) context.Context {
	c, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	return c
}

func TestModeratePhoto(t *testing.T) {
	c := dialFake(t, &fakeServer{})
	res, err := c.ModeratePhoto(ctx(t), ImageURL("https://cdn/x.jpg"))
	if err != nil {
		t.Fatalf("ModeratePhoto: %v", err)
	}
	if !res.Approved || res.Labels[0] != "safe" {
		t.Fatalf("res = %+v", res)
	}
}

func TestDescribeScene(t *testing.T) {
	c := dialFake(t, &fakeServer{})
	res, err := c.DescribeScene(ctx(t), ImageBytes([]byte{1, 2, 3}, "image/jpeg"), "uk")
	if err != nil {
		t.Fatalf("DescribeScene: %v", err)
	}
	if res.OcrText != "ВХІД" || res.Description == "" {
		t.Fatalf("res = %+v", res)
	}
}

func TestAnalyzePhotoConcurrent(t *testing.T) {
	c := dialFake(t, &fakeServer{})
	a, err := c.AnalyzePhoto(ctx(t), ImageURL("https://cdn/x.jpg"), "venue")
	if err != nil {
		t.Fatalf("AnalyzePhoto: %v", err)
	}
	if a.Moderation == nil || !a.Moderation.Approved {
		t.Fatalf("moderation = %+v", a.Moderation)
	}
	if a.Features == nil || len(a.Features.Features) != 1 || a.Features.Features[0].Key != "step_free_entrance" {
		t.Fatalf("features = %+v", a.Features)
	}
}

func TestAnalyzePhotoPropagatesError(t *testing.T) {
	c := dialFake(t, &fakeServer{inferErr: errors.New("model down")})
	if _, err := c.AnalyzePhoto(ctx(t), ImageURL("https://cdn/x.jpg"), "venue"); err == nil {
		t.Fatal("expected error when a sub-call fails")
	}
}
