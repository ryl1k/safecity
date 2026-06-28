"""Tests for the ML gRPC server: direct servicer calls + a real round-trip."""

from concurrent import futures

import grpc

from safecity_ml.genpb import ml_pb2, ml_pb2_grpc
from safecity_ml.server import MLService, build_server


def test_moderate_photo_stub_approves() -> None:
    svc = MLService()
    req = ml_pb2.ModeratePhotoRequest(image=ml_pb2.ImageSource(image_url="http://x/y.jpg"))
    resp = svc.ModeratePhoto(req, None)
    assert resp.approved is True
    assert "unverified-stub" in resp.labels


def test_infer_features_stub_empty() -> None:
    svc = MLService()
    resp = svc.InferFeatures(ml_pb2.InferFeaturesRequest(category="venue"), None)
    assert list(resp.features) == []


def test_build_server_returns_server() -> None:
    server = build_server("127.0.0.1:0")
    assert isinstance(server, grpc.Server)


def test_grpc_roundtrip() -> None:
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=2))
    ml_pb2_grpc.add_MLServiceServicer_to_server(MLService(), server)
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    try:
        with grpc.insecure_channel(f"127.0.0.1:{port}") as channel:
            stub = ml_pb2_grpc.MLServiceStub(channel)
            resp = stub.ModeratePhoto(
                ml_pb2.ModeratePhotoRequest(image=ml_pb2.ImageSource(image_url="http://x/y.jpg")),
                timeout=5,
            )
            assert resp.approved is True
    finally:
        server.stop(grace=None)
