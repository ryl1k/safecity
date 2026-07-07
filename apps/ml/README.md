# @safecity/ml

Server-side CV/AI microservices over **gRPC** (Python), called by `apps/api`.

```
src/safecity_ml/
  server.py     MLService gRPC server (scaffold handlers)
  genpb/        generated stubs from packages/proto/ml.proto (committed)
  __main__.py   `python -m safecity_ml` → serves on :50051
```

> ⚠️ The **live blind-walk CV stays on-device** in `apps/mobile` (latency/offline).
> This tier never runs the real-time walk loop — it handles photo moderation,
> OCR/scene-description fallback, and accessibility-feature inference from photos.

The gRPC surface is real (the Go API can call it today); the handlers return
placeholder results until real models are wired in.

## Run / test

```
pip install -e ".[dev]"        # grpcio + grpcio-tools + pytest
python -m safecity_ml          # serve on :50051
PYTHONPATH=src python -m pytest
```

## Contract

Defined in `packages/proto/ml.proto` (`safecity.ml.v1.MLService`). Regenerate the
`genpb/` stubs per `packages/proto/README.md` after editing the proto.

KB: `06 · CV + TTS`, `10 · Tech & Architecture`.
