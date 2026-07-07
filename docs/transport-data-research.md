# Accessible public transport — data source research

*Researched 2026-07-02. Question: where can we get "this bus route is wheelchair-accessible
(low-floor) vs not (e.g. Bogdan minibuses with steps)" for Lviv, ideally all of Ukraine?*

## TL;DR — validated source

**Lviv publishes official GTFS with real `wheelchair_accessible` flags on trips.**

| What | Where | Verified |
| --- | --- | --- |
| Static GTFS (routes, trips, stops, shapes, times) | `https://track.ua-gis.com/gtfs/lviv/static.zip` | ✅ 3.7 MB, updated ~weekly (file dated 2 days before check) |
| GTFS-realtime vehicle positions | `https://track.ua-gis.com/gtfs/lviv/vehicle_position` | ✅ endpoint live (protobuf; near-empty at night) |
| Dataset registration | [data.gov.ua](https://data.gov.ua/en/dataset/lviv-public-transport-gtfs-real-time), [Lviv open-data portal](https://opendata.city-adm.lviv.ua/dataset/lviv-public-transport-gtfs-real-time) | ✅ open license (Law "On Access to Public Information") |

### What the flags say (feed of 2026-06-29)

- 15,506 trips: **2,193 flagged `wheelchair_accessible=1`**, rest `0` (unknown/not guaranteed).
- Marking is **route-level** (no mixed routes): **8 routes are fully accessible** —
  **А41, А10, А45, А63, Т08 (tram), Тр24, А51, А53**; the other 63 routes have zero flagged trips.
  This matches the city's known low-floor routes vs the Bogdan/minibus fleet.
- `stops.txt` has **no `wheelchair_boarding`** — stop accessibility is NOT in GTFS.
  Our national «Мапа безбар'єрності» import already covers that (256 Lviv stops with
  ramp/boarding criteria) — the two sources are complementary:
  **GTFS = vehicle/route accessibility, bezbar = stop infrastructure accessibility.**
- Join validated: accessible routes → trips → stop_times → stops gives
  **193 of 1,020 stops served by ≥1 accessible route**, and `shapes.txt` has geometry
  for all 8 routes (drawable as map lines).

## Ukraine-wide

- Same vendor (ua-gis / DozoR trackers) hosts **Uzhhorod**: `…/gtfs/uzhhorod/static.zip`,
  flags also populated (422 accessible trips). Other city slugs on that host 404.
- data.gov.ua lists ~11 transit datasets (Sumy realtime, several cities' stop/schedule
  sets) — **per-city formats, no single national feed**. Kyiv/Kharkiv/Vinnytsia publish
  through their own portals/vendors; coverage and accessibility flags vary.
- Realistic approach: build the importer **per-GTFS-feed with a config per city**
  (URL + city bbox), start with Lviv (+ Uzhhorod free of charge), add cities as their
  feeds are discovered/verified.
- No open per-vehicle registry ("this exact bus is a low-floor MAZ") exists; the newer
  GTFS-RT `VehicleDescriptor.wheelchair_accessible` field is the only per-vehicle hope,
  worth checking in the realtime feed during service hours.

## SOLVED: journey planning via Transitous (verified 2026-07-03)

**[Transitous](https://transitous.org)** — a free, community-run MOTIS routing API
(`api.transitous.org`, no key) — already imports **Lviv's GTFS (static + both
realtime feeds), Ukrzaliznytsia rail, Odesa and Stryi**. Verified live:

- `GET /api/v3/plan?fromPlace=lat,lng&toPlace=lat,lng` returns real Lviv
  itineraries (walk → tram/bus → walk, with transfers).
- `pedestrianProfile=WHEELCHAIR` routes the walking legs for wheelchairs.
- Every transit leg carries **`wheelchairAccessible: ACCESSIBLE | NOT_ACCESSIBLE`**
  — sourced from the same GTFS trip flags we validated (Т08/А53 → ACCESSIBLE,
  Т04 → NOT_ACCESSIBLE). The app can prefer/filter fully accessible itineraries
  and badge each leg.
- Legs include polyline geometry for map drawing; realtime delays included.
- Caveats: community fair-use service (no SLA); origin coords occasionally fail
  to snap in pedestrian zones (nudge to the nearest stop as fallback); coverage
  of other Ukrainian cities depends on Transitous adding their feeds.

**Integration plan:** add a «Транспортом» mode to the route panel → call
Transitous plan with `pedestrianProfile=WHEELCHAIR` → sort itineraries by
"all transit legs accessible" first → render legs with route badges +
accessibility markers + line geometry on the map.

## Earlier proposed implementation (stops/lines import — still useful later)

1. **Importer** `tooling/importers/gtfs-transport.mjs`:
   read static.zip → per stop: name, lng/lat, list of serving routes with
   `accessible: yes/unknown` → upsert as `transit` points (osm_id `gtfs/lviv/<stop_id>`),
   description like «Зупинка. Доступні маршрути: А41, Т08. Інші: А25, …».
   Where a bezbar stop exists within ~40 m, merge rather than duplicate.
2. **Route lines**: store the 8 accessible shapes as GeoJSON (static file or table);
   map toggle «Доступні маршрути» draws them.
3. **Point detail**: transit points show the accessible-routes list first.
4. Refresh: re-run importer weekly (feed updates 1–2×/week).
