---
name: safecity-project
description: SafeCity — inclusive accessibility map for Lviv; project scope, decisions, and where the knowledge base lives
metadata:
  type: project
---

SafeCity is an inclusive map (mobile + web) for **Lviv, Ukraine** helping people with disabilities navigate the city. Near-term goal: **win a hackathon with a working, no-mocks demo**. North-star metric: **# barriers reported → resolved**.

The full project knowledge base + task board live in the **`board` MCP server** (Aptios), not in the repo. There are 12 KB notes (tag `safecity`, numbered 00–12) covering Vision, Map, Onboarding, Points, Routing, CV+TTS, Civic Loop, Accounts, Data Seeding, Architecture, A11y Standards, Roadmap. Tasks are organized as `[EPIC]` tasks + child tasks labeled `epic:<slug>` and milestone `M0`–`M9`. Read the board before working — notes have **Open Questions** sections to extend.

Key locked decisions: two onboarding branches (wheelchair + blind) with **adaptive onboarding as the spine**; per-profile traffic-light accessibility (checklist-derived); civic **Problem→Petition** loop (internal rally + official Lviv e-petition link) as the differentiator; on-device CV+TTS (vision-camera + ML Kit; curbs/crossings need a custom-model spike — top risk); ORS hosted routing with `avoid_polygons` from confirmed problems; stack = Turborepo monorepo, Expo dev client + Next.js, Supabase (Postgres+PostGIS/Auth/Storage), REST main API + gRPC for server-side ML, MapLibre+OSM. Team includes ryl1k and demik. See [[safecity-working-style]].
