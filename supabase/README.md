# supabase/

Database, security, and seed (managed via the Supabase CLI).

```
migrations/   schema for all entities (KB 04/06/07/08): Point, AccessibilityFeature,
              PointFeatureValue, Review, Problem, ProblemConfirmation, Petition,
              PetitionSignature, User/Role, AccessibilityProfile. PostGIS geo + indexes.
policies/     Row-Level Security — guest read; account-gated contribute; moderator powers.
seed/         baseline reference data (categories, feature catalog).
```

PostGIS powers near-me, bbox map queries, route-corridor problem lookups, and dedupe.
