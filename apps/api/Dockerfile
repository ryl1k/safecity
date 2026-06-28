# syntax=docker/dockerfile:1
# Build context = repo root (see .github/workflows/cd.yml). Multi-stage Go build
# → distroless static runtime: small, static, non-root.

FROM golang:1.26 AS build
WORKDIR /src

# Download deps first so they cache independently of source changes.
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download

COPY apps/api/ ./

# Static, stripped, reproducible binary.
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# Distroless static: no shell, no libc, runs as a non-root user. Ships CA certs
# for the API's outbound TLS (Supabase, JWKS, ORS, Nominatim).
FROM gcr.io/distroless/static:nonroot
WORKDIR /
COPY --from=build /out/server /server
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/server"]
