"""SafeCity ML gRPC server.

Scaffold implementations: the RPC surface + wiring is real (the Go API can call
it today), but the handlers return placeholder results until real models are
plugged in. The real-time blind-walk CV is NOT here — it stays on-device.
"""

from __future__ import annotations

import logging
from concurrent import futures

import grpc

from .genpb import ml_pb2, ml_pb2_grpc

_LOG = logging.getLogger("safecity_ml")
DEFAULT_ADDRESS = "[::]:50051"


class MLService(ml_pb2_grpc.MLServiceServicer):
    """Implements safecity.ml.v1.MLService."""

    def ModeratePhoto(self, request, context):  # noqa: N802 (gRPC naming)
        # TODO: run a real NSFW/abuse model. Until then, approve (fail-open) but
        # label the result so callers know it's unverified.
        return ml_pb2.ModeratePhotoResponse(
            approved=True, nsfw_score=0.0, labels=["unverified-stub"]
        )

    def DescribeScene(self, request, context):  # noqa: N802
        # TODO: OCR + caption model.
        return ml_pb2.DescribeSceneResponse(description="", ocr_text="", confidence=0.0)

    def InferFeatures(self, request, context):  # noqa: N802
        # TODO: accessibility-feature classifier.
        return ml_pb2.InferFeaturesResponse(features=[])


def build_server(address: str = DEFAULT_ADDRESS, max_workers: int = 10) -> grpc.Server:
    """Build (but do not start) a gRPC server bound to address."""
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=max_workers))
    ml_pb2_grpc.add_MLServiceServicer_to_server(MLService(), server)
    server.add_insecure_port(address)
    return server


def serve(address: str = DEFAULT_ADDRESS) -> None:
    """Build, start, and block on the gRPC server."""
    logging.basicConfig(level=logging.INFO)
    server = build_server(address)
    server.start()
    _LOG.info("safecity-ml gRPC listening on %s", address)
    server.wait_for_termination()
