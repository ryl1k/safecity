# @safecity/ml

Server-side CV/AI microservices over **gRPC**, called by `apps/api`.

```
proto/   .proto service contracts (shared with api)
src/     imageModeration, ocr (phase-2), importClassify
```

> ⚠️ The **live blind-walk CV stays on-device** in `apps/mobile` (latency/offline).
> This tier never runs the real-time walk loop — it handles photo moderation,
> OCR/scene-description fallback, and import category inference.

**Open decision:** language — Node (consistency) vs Python (richer vision libs).

KB: `06 · CV + TTS`, `10 · Tech & Architecture`.
