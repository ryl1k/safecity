# Nationwide coverage — what each data layer looks like beyond Lviv

*Measured 2026-07-02 from the actual datasets (not press releases).*

## 1. Accessibility points — «Мапа безбар'єрності» (already imported for Lviv)

The national files we already download are **country-wide**; our importer just filters
to a Lviv bbox. Measured from the live files:

- **22,240 objects · all 24 non-occupied oblasts · 3,319 localities.**
- Top cities: Київ 4,359 · Запоріжжя 1,244 · Львів 757 · Луцьк 498 · Одеса 407 ·
  Дніпро 398 · Кривий Ріг 380 · Житомир 278 · Хмельницький 269 · Вінниця 268 · Харків 174.
- Occupied/front-line regions are naturally near-empty (Херсонська 61, Донецька 56,
  Луганська 0, Crimea absent) — the "exclude occupied" requirement handles itself.
- **IMPLEMENTED (2026-07-02):** `bezbarrier.mjs --national --apply --prune` imports the
  top ~35 showcase points (ranked by documented amenities + monitoring rating,
  venue/transit 2:1) for each of the **75 most-populated government-controlled cities
  that have data** (candidates without ≥5 monitored objects are skipped; renamed
  cities under current names — Самар, Шептицький, Звягель). `--prune` removes bezbar
  points outside the selection, so Lviv was trimmed from 781 → 35 for an even demo.
  The web city registry (`apps/web/src/lib/cities.ts`) is generated from the same
  selection with data-derived city centres.

## 2. Transport (GTFS with wheelchair flags) — patchy, per-city

See `transport-data-research.md`. Validated: **Львів + Ужгород** (ua-gis feeds with real
`wheelchair_accessible` flags). No national feed exists; Kyiv/Kharkiv/Vinnytsia/Sumy
publish via their own portals in different formats, many cities publish nothing.
**Strategy: one importer + per-city feed configs; add cities as feeds are verified.**

## 3. Height / slopes — already solved for routing

- Wheelchair routing inclines are computed by **OpenRouteService server-side** from its
  elevation model — we already send `maximum_incline`; every Ukrainian city gets this
  for free through the same `/route` proxy. Nothing to import.
- If we ever want our own slope visualization: **Copernicus DEM GLO-30** (free, open,
  30 m, covers Ukraine) or SRTM 30 m. Note: higher-resolution state geodata is
  restricted under martial law — 30 m open DEMs are the realistic ceiling.

## 4. Baseline infrastructure (crossings, kerbs, toilets, parking) — OSM, nationwide

OpenStreetMap covers the whole country with variable density; the repo already has
importers (`cmd/import-osm` Go CLI, Overpass tooling). Works for any city bbox today.

## 5. Geocoding / routing / basemap — already nationwide

Nominatim, ORS and the CARTO basemap are country-agnostic — they already work for all
of Ukraine, no extra data needed.

## What multi-city actually requires in the app (the real work)

The data is mostly ready; the app is Lviv-hardcoded:

1. **City registry** (name, bbox, center, GTFS feed URL if any) instead of the
   hardcoded `LVIV_BBOX`/center in `apps/web/app/map/page.tsx` and `places/page.tsx`.
2. **City selection** — geolocation-based default + a picker.
3. Importer runs per city (bezbar: flip the filter; GTFS: per-city configs).
4. Map perf is fine: points load per selected city bbox, clustering handles density
   (Kyiv's 4.4k points cluster the same way Lviv's 781 do).

Recommended order: keep polishing Lviv as the flagship → flip bezbar to nationwide
(cheap, instant coverage) → add city registry/picker → per-city GTFS as feeds are found.
