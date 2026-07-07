# syntax=docker/dockerfile:1
# Build context = repo root. Python CV/AI gRPC service (currently a scaffold).
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app/apps/ml

COPY apps/ml/pyproject.toml apps/ml/README.md ./
COPY apps/ml/src ./src
RUN pip install --no-cache-dir .

EXPOSE 50051
CMD ["python", "-m", "safecity_ml"]
