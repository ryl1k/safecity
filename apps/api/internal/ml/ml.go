// Package ml is the Go client for the Python ML gRPC service (apps/ml): photo
// moderation, OCR/scene description, and accessibility-feature inference. The
// real-time blind-walk CV stays on-device — it is not called from here.
package ml

import (
	"context"

	"golang.org/x/sync/errgroup"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/safecity/api/internal/mlpb"
)

// Client wraps the generated gRPC client + its connection.
type Client struct {
	conn *grpc.ClientConn
	svc  mlpb.MLServiceClient
}

// Dial creates a lazily-connecting client to the ML service at addr. The
// connection is plaintext (internal service; add mTLS at the mesh/ingress).
func Dial(addr string) (*Client, error) {
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}
	return NewFromConn(conn), nil
}

// NewFromConn builds a Client over an existing connection (used by tests).
func NewFromConn(conn *grpc.ClientConn) *Client {
	return &Client{conn: conn, svc: mlpb.NewMLServiceClient(conn)}
}

// Close releases the underlying connection.
func (c *Client) Close() error {
	if c.conn == nil {
		return nil
	}
	return c.conn.Close()
}

// ── image source helpers ─────────────────────────────────────────────────────

// ImageURL builds an ImageSource that the ML service will fetch.
func ImageURL(url string) *mlpb.ImageSource {
	return &mlpb.ImageSource{Source: &mlpb.ImageSource_ImageUrl{ImageUrl: url}}
}

// ImageBytes builds an ImageSource from raw bytes.
func ImageBytes(b []byte, contentType string) *mlpb.ImageSource {
	return &mlpb.ImageSource{Source: &mlpb.ImageSource_Image{Image: b}, ContentType: contentType}
}

// ── single calls ─────────────────────────────────────────────────────────────

// ModeratePhoto checks whether a photo is safe to publish.
func (c *Client) ModeratePhoto(ctx context.Context, src *mlpb.ImageSource) (*mlpb.ModeratePhotoResponse, error) {
	return c.svc.ModeratePhoto(ctx, &mlpb.ModeratePhotoRequest{Image: src})
}

// DescribeScene returns OCR text + a scene description.
func (c *Client) DescribeScene(ctx context.Context, src *mlpb.ImageSource, language string) (*mlpb.DescribeSceneResponse, error) {
	return c.svc.DescribeScene(ctx, &mlpb.DescribeSceneRequest{Image: src, Language: language})
}

// InferFeatures predicts accessibility feature values from a photo.
func (c *Client) InferFeatures(ctx context.Context, src *mlpb.ImageSource, category string) (*mlpb.InferFeaturesResponse, error) {
	return c.svc.InferFeatures(ctx, &mlpb.InferFeaturesRequest{Image: src, Category: category})
}

// ── orchestration ────────────────────────────────────────────────────────────

// Analysis bundles the results of analyzing one uploaded photo.
type Analysis struct {
	Moderation *mlpb.ModeratePhotoResponse
	Features   *mlpb.InferFeaturesResponse
}

// AnalyzePhoto runs moderation and feature inference concurrently for a freshly
// uploaded point photo. If either call fails the other is cancelled and the
// error is returned (the caller decides whether to publish without ML).
func (c *Client) AnalyzePhoto(ctx context.Context, src *mlpb.ImageSource, category string) (Analysis, error) {
	var a Analysis
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		r, err := c.ModeratePhoto(gctx, src)
		if err != nil {
			return err
		}
		a.Moderation = r
		return nil
	})
	g.Go(func() error {
		r, err := c.InferFeatures(gctx, src, category)
		if err != nil {
			return err
		}
		a.Features = r
		return nil
	})
	if err := g.Wait(); err != nil {
		return Analysis{}, err
	}
	return a, nil
}
