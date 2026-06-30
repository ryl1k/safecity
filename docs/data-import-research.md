# SafeCity — Accessibility Data Source Research

_Researched 2026-06-30 (branch `research/data-sources`). Live Overpass counts run against `overpass-api.de`, Lviv bbox `49.78,23.90 → 49.90,24.12`._

## TL;DR

The Google My Map you linked (the official **"Доступне місто – Львів"** by the Lviv Tourist Office) is a nice **137-venue seed list**, but it carries **almost no machine-readable accessibility data** (just pins + a freetext line). The real prizes are:

1. **National "Мапа безбар'єрності" GeoJSON** on data.gov.ua (Mindev + LUN) — **~3,000+ Lviv-oblast points** with **rich, decodable accessibility criteria** + a ready-made rating, **CC-BY**. This is the winner.
2. **OpenStreetMap via Overpass** — **~1,150 wheelchair + 360 tactile** objects, **drops into our existing importer with zero new code**, and is the *only* source with **audio/vibration crossing signals** (183/163).
3. **Lviv City transit-stop CSV** — **~969 stops** with curb height, tactile tile, per-mode boarding — the deepest transit data for the city.

Our infrastructure is ready: Go/Node importers already exist for **Overpass JSON** and **KML**, with idempotent `osm_id` upsert + proximity/name dedupe (`apps/api/internal/importer/*`). Our value lives in **42 accessibility feature keys** (critical ones drive the traffic-light rating), so a source's worth = how well it fills those keys.

## Comparison table

| # | Source / approach | Points (Lviv) | Fits current setup | User value (richness) | Complexity | License |
|---|---|---|---|---|---|---|
| 1 | **National "Мапа безбар'єрності" GeoJSON** (data.gov.ua, Mindev+LUN) | **~3,000+ oblast / ~930+ city** | New small **GeoJSON adapter** (join `criteria.json`) | ★★★★★ richest — decodable yes/no criteria (ramps, step-free, elevators, accessible WC, tactile, disabled parking, **staff assistance**) + numeric `rating` + photos | Medium (one adapter) | **CC-BY 4.0** ✅ |
| 2 | **OSM via Overpass (live)** | ~1,144 wheelchair, 360 tactile, 872 bus stops, 1,476 PT platforms, 261 signals (**183 audio**) | ✅ **reuse Overpass importer, ~0 code** | ★★★★ real attributes, both profiles; **only source with audio/vibration crossings**; venue coverage ~5% | **Lowest** | ODbL ✅ |
| 3 | **Lviv City transit-stop CSV** (opendata.city-adm.lviv.ua) | **~969 stops** | New small **CSV adapter** (CP1251, `;`) | ★★★★ deep transit: curb height, tactile tile, per-mode boarding, adjacent crossing, official verdict | Low–Med | **CC-BY** ✅ |
| 4 | **Google My Maps "Доступне місто"** (Lviv Tourist Office) | **137** | ✅ **reuse KML importer, 0 code** | ★ curated venue locations only; **1/137 has real a11y detail**; no attributes/categories | Trivial | ⚠ grey (Google ToS on coords + Office compilation rights) → **partner** |
| 5 | **Lviv City public-toilets + building-accessibility CSV** | toilets ~handful; buildings ~9–15 | New small CSV adapter | ★★★ authoritative but niche/low volume | Low | CC-BY ✅ |
| 6 | **accessibility.cloud** (A11yJSON, Sozialhelden) | ≈ OSM in Lviv (little uplift) | New **GeoJSON/A11yJSON adapter** + per-source license gate | ★★★★★ schema, ★★ for Lviv today | Medium | ⚠ mixed per-source |
| 7 | **OSM bulk via Geofabrik PBF** | = OSM, but **all-Ukraine** (826 MB) | New **osmium + GeoJSON adapter** | ★★★★ same as #2 | Medium | ODbL ✅ |
| 8 | **Доступно.UA** (dostupno.ua NGO) | Lviv subset of ~1,140/28 cities | ✗ **no export/API** | ★★★★★ expert-audited (green/orange/red, Braille menu, etc.) | High (scrape/partnership) | ⚠ proprietary → **partnership only** |
| 9 | **Wheelmap / AXS Map / Jaccede** | 0 net | — | — | — | **Skip**: Wheelmap = OSM (redundant + deprecated); AXS Map & Jaccede = proprietary/Google, ~0 Lviv coverage |

## Per-source notes

- **#1 National GeoJSON** — dataset id `38997a1f-2e86-4bd7-9054-cd9cd206d825` on data.gov.ua; resources are GeoJSON per category (`stops`, `establishments`, `objects`, `pathways`, `buildings`, `infrastructure`, …) plus `criteria.json` (the attribute dictionary) and `categories.json`. Each feature: `title, kind, address, lat, lon, rating (0–1), ratingAuthority (бар'єрний/частково/безбар'єрний), categories:[{criteria:[{id,value:"так"/"ні", photos}]}]`. Criteria ids map almost 1:1 to our 42 feature keys. Updated monthly. **Only real gap: no audio-crossing-signal attribute (OSM fills it).** Needs a browser User-Agent on the CKAN API.
- **#2 OSM/Overpass** — `nwr[wheelchair](area); … out center tags;` → straight into the existing importer. Use `capacity:disabled` for disabled parking (`parking:disabled` is 0 in Lviv). Dedupe OSM on `osm_id`, not proximity.
- **#3 Lviv transit CSV** — dataset "Ступінь доступності зупинок громадського транспорту ЛМТГ" (id `e50c1ded-…`); CSV is CP1251, `;`-delimited, has a `structure_accessibility.csv` dictionary. Richer than the 238 Lviv stops in #1.
- **#4 Google My Map** — `https://www.google.com/maps/d/kml?mid=1SD_irzi2s21yLx0pAY8avXDYTjoBcpE&forcekml=1` (public, no auth). 10 layers (food 49, accommodation 31, municipal 19, culture 10, parks 9, museums 6, healthcare 5, entertainment 5, libraries 2, sport 1). Best used as a **lead list to survey**, ideally via a partnership with the Tourist Office (re-derive coords from OSM/geocoding to clear the Google ToS issue).

## Recommended plan (phased)

**Phase 1 — instant, zero new code (this week)**
- Run the existing **Overpass importer** for Lviv accessibility tags → ~1,150 wheelchair + 360 tactile + transit geometry + audio crossings. ODbL, idempotent on `osm_id`.
- Optionally import the **My Maps KML** (137) via the existing KML importer as a **survey lead list** — but flag the licensing and prefer to reach out to the Tourist Office first.

**Phase 2 — the big payoff (one adapter)**
- Build a **GeoJSON → SafeCity adapter** for the **National "Мапа безбар'єрності"** dataset: map `kind`→category, join `categories.criteria` ids against `criteria.json` → our 42 feature keys, seed our rating from `rating`/`ratingAuthority`, ingest `photos`. ~3,000 Lviv points, CC-BY. Highest value-per-effort after Phase 1.

**Phase 3 — transit depth + niche**
- Small **CSV adapters** for the **Lviv City transit-stop** (969) and **public-toilets** datasets (CC-BY, authoritative).

**Later / strategic**
- **accessibility.cloud** (A11yJSON) when expanding beyond Lviv; **Geofabrik PBF** when scaling to all-Ukraine/offline; **partnerships** with **Доступно.UA** and the **Lviv Tourist Office** for curated, authoritative data.

## Cross-cutting notes

- **Dedupe & conflict priority** — sources overlap heavily on Lviv transit/venues, so our proximity+name dedupe is load-bearing. Suggested source priority for conflicts: **transit** → city CSV > national GeoJSON > OSM; **venues** → national GeoJSON > OSM > My Maps. Match OSM-derived data on `osm_id`; reserve proximity-dedupe for cross-source merges.
- **Attribution** — ODbL (OSM) needs attribution + share-alike on derived DB; CC-BY (gov/city) needs attribution. Add a "data sources" credit in the app.
- **Provenance** — import with `source='imported'`; consider `verify_status='verified'` for official gov/city data, `'unverified'` for OSM/community until reviewed.
