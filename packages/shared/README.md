# @safecity/shared

Platform-agnostic single source of truth. **No React, no Node-only APIs** — importable by
mobile, web, and api alike.

```
src/
  types/        Point, AccessibilityFeature, PointFeatureValue, Review, Problem,
                Petition, AccessibilityProfile, enums (Category, Profile, Rating)
  schemas/      zod schemas (validation reused by api + clients)
  rules/        ⭐ accessibility rules engine: computeRating(features, category, profile)
                + critical-feature catalog. ONE implementation used everywhere.
  constants/    category list, feature keys, traffic-light definitions
  api-client/   typed REST client wrapper
```

KB: `04 · Points & Accessibility`, `10 · Tech & Architecture`.
