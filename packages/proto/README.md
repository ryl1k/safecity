# @safecity/proto

Shared gRPC contracts between the Go API (`apps/api`) and the Python ML service
(`apps/ml`). Single source of truth: **`ml.proto`** (`safecity.ml.v1`).

Generated stubs are committed in both apps; regenerate after editing `ml.proto`.

## Regenerate

Needs `buf`, `protoc-gen-go`, `protoc-gen-go-grpc` (install once):

```
go install github.com/bufbuild/buf/cmd/buf@latest
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
```

**Go stubs** → `apps/api/internal/mlpb` (config in `buf.gen.yaml`):

```
cd packages/proto
buf lint
buf generate
```

**Python stubs** → `apps/ml/src/safecity_ml/genpb` (needs `grpcio-tools`):

```
cd <repo root>
python -m grpc_tools.protoc -I packages/proto \
  --python_out=apps/ml/src/safecity_ml/genpb \
  --grpc_python_out=apps/ml/src/safecity_ml/genpb \
  packages/proto/ml.proto
# then fix the relative import in the generated grpc file:
#   import ml_pb2  ->  from . import ml_pb2
```

## Service

`MLService` — server-side AI called by the Go API:
- `ModeratePhoto` — is an uploaded photo safe to publish?
- `DescribeScene` — OCR + scene description (accessibility fallback).
- `InferFeatures` — predict accessibility feature values from a photo.

> The real-time blind-walk CV stays **on-device** (`apps/mobile`); it is not part
> of this contract.
