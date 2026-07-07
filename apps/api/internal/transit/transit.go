// Package transit plans public-transport journeys via Transitous (free
// community MOTIS API) and owns all accessibility business logic: the per-route
// vehicle table, GTFS-flag semantics, itinerary ranking, and vehicle category
// labels. Clients (web/mobile) only render what this package returns.
//
// Coverage: Lviv only for now (the only Ukrainian city whose feed we've
// verified end-to-end). Plan reports covered=false elsewhere.
package transit

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Access classifies vehicle accessibility for a wheelchair user.
type Access string

const (
	AccessYes     Access = "yes"
	AccessNo      Access = "no"
	AccessUnknown Access = "unknown"
)

// Leg is one segment of an itinerary (a walk or a ride).
type Leg struct {
	Mode      string       `json:"mode"`  // WALK | BUS | TRAM | SUBWAY | …
	Route     string       `json:"route"` // e.g. "А53", "Т08"; "" for walks
	Category  string       `json:"category"`
	Label     string       `json:"label"` // "Маршрутка А43", "Пішки", …
	FromName  string       `json:"fromName"`
	ToName    string       `json:"toName"`
	StartTime string       `json:"startTime"` // ISO 8601
	EndTime   string       `json:"endTime"`
	Access    Access       `json:"access"`
	Coords    [][2]float64 `json:"coords"` // [lng,lat] polyline for the map
}

// Itinerary is one journey option.
type Itinerary struct {
	DurationMin int    `json:"durationMin"`
	Transfers   int    `json:"transfers"`
	StartTime   string `json:"startTime"`
	EndTime     string `json:"endTime"`
	// yes — every transit leg confirmed accessible; unknown — no leg is
	// confirmed inaccessible but some lack data; no — has an inaccessible leg.
	Access Access `json:"access"`
	Legs   []Leg  `json:"legs"`
}

// Result is the full plan response. When Covered is false, Notice carries the
// user-facing explanation and Itineraries is empty.
type Result struct {
	Covered     bool        `json:"covered"`
	Notice      string      `json:"notice,omitempty"`
	Itineraries []Itinerary `json:"itineraries"`
}

// notCoveredNotice is the single source of the coverage message (web + mobile).
const notCoveredNotice = "Маршрути громадським транспортом наразі доступні лише у Львові."

// lvivBBox bounds the covered area.
var lvivBBox = struct{ minLng, minLat, maxLng, maxLat float64 }{23.85, 49.74, 24.22, 49.96}

// Covered reports whether both endpoints fall inside the covered area.
func Covered(from, to [2]float64) bool {
	in := func(p [2]float64) bool {
		return p[0] >= lvivBBox.minLng && p[0] <= lvivBBox.maxLng &&
			p[1] >= lvivBBox.minLat && p[1] <= lvivBBox.maxLat
	}
	return in(from) && in(to)
}

// WalkRouterFunc routes a single walk leg accessibly. It returns [lng,lat] pairs
// or an error; on error the caller falls back to MOTIS geometry.
type WalkRouterFunc func(fromLng, fromLat, toLng, toLat float64) ([][2]float64, error)

// Client talks to the Transitous MOTIS API.
type Client struct {
	http       *http.Client
	base       string
	now        func() time.Time // injectable for tests
	walkRouter WalkRouterFunc   // nil = use MOTIS walk geometry
}

// New builds a Client. timeout bounds each upstream call.
func New(base string, timeout time.Duration) *Client {
	return &Client{
		http: &http.Client{Timeout: timeout},
		base: strings.TrimRight(base, "/"),
		now:  time.Now,
	}
}

// WithWalkRouter attaches an accessible walk router. When set, every WALK leg
// inside Lviv coverage is re-routed via the accessible street graph; MOTIS
// geometry is kept as fallback if the router fails.
func (c *Client) WithWalkRouter(fn WalkRouterFunc) *Client {
	c.walkRouter = fn
	return c
}

// Plan requests journeys from → to (both [lng,lat]) departing now, and returns
// itineraries ranked accessible-first (see rankItineraries for the 2× rule).
func (c *Client) Plan(ctx context.Context, from, to [2]float64) (Result, error) {
	if !Covered(from, to) {
		return Result{Covered: false, Notice: notCoveredNotice, Itineraries: []Itinerary{}}, nil
	}

	q := url.Values{}
	q.Set("fromPlace", fmt.Sprintf("%s,%s", fmtCoord(from[1]), fmtCoord(from[0])))
	q.Set("toPlace", fmt.Sprintf("%s,%s", fmtCoord(to[1]), fmtCoord(to[0])))
	q.Set("time", c.now().UTC().Format(time.RFC3339))
	q.Set("pedestrianProfile", "WHEELCHAIR")
	// City surface transport only — rail excluded by product decision.
	q.Set("transitModes", "BUS,TRAM,SUBWAY")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/plan?"+q.Encode(), nil)
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return Result{}, fmt.Errorf("transitous request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return Result{}, fmt.Errorf("transitous status %d", resp.StatusCode)
	}

	var raw motisPlan
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&raw); err != nil {
		return Result{}, fmt.Errorf("decode transitous response: %w", err)
	}

	its := make([]Itinerary, 0, len(raw.Itineraries))
	for _, it := range raw.Itineraries {
		its = append(its, mapItinerary(it, c.walkRouter))
	}
	rankItineraries(its)
	if len(its) > 6 {
		its = its[:6]
	}
	return Result{Covered: true, Itineraries: its}, nil
}

// fmtCoord renders a coordinate without float noise.
func fmtCoord(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }

// ── MOTIS response mapping ───────────────────────────────────────────────────

type motisPlan struct {
	Itineraries []motisItinerary `json:"itineraries"`
}

type motisItinerary struct {
	Duration  float64    `json:"duration"` // seconds
	Transfers *int       `json:"transfers"`
	StartTime string     `json:"startTime"`
	EndTime   string     `json:"endTime"`
	Legs      []motisLeg `json:"legs"`
}

type motisLeg struct {
	Mode                 string     `json:"mode"`
	RouteShortName       string     `json:"routeShortName"`
	From                 motisPlace `json:"from"`
	To                   motisPlace `json:"to"`
	StartTime            string     `json:"startTime"`
	EndTime              string     `json:"endTime"`
	WheelchairAccessible string     `json:"wheelchairAccessible"`
	LegGeometry          struct {
		Points    string `json:"points"`
		Precision *int   `json:"precision"`
	} `json:"legGeometry"`
}

type motisPlace struct {
	Name string `json:"name"`
}

func mapItinerary(it motisItinerary, wr WalkRouterFunc) Itinerary {
	legs := make([]Leg, 0, len(it.Legs))
	for _, l := range it.Legs {
		legs = append(legs, mapLeg(l, wr))
	}

	access := AccessUnknown
	transit := 0
	allYes := true
	for _, l := range legs {
		if l.Mode == "WALK" {
			continue
		}
		transit++
		if l.Access == AccessNo {
			access = AccessNo
		}
		if l.Access != AccessYes {
			allYes = false
		}
	}
	if access != AccessNo && transit > 0 && allYes {
		access = AccessYes
	}

	transfers := 0
	if it.Transfers != nil {
		transfers = *it.Transfers
	} else if transit > 1 {
		transfers = transit - 1
	}

	return Itinerary{
		DurationMin: int(it.Duration/60 + 0.5),
		Transfers:   transfers,
		StartTime:   it.StartTime,
		EndTime:     it.EndTime,
		Access:      access,
		Legs:        legs,
	}
}

func mapLeg(l motisLeg, wr WalkRouterFunc) Leg {
	route := l.RouteShortName
	access := AccessUnknown
	if l.Mode != "WALK" {
		access = accessOf(l.WheelchairAccessible, route)
	}
	precision := 6
	if l.LegGeometry.Precision != nil {
		precision = *l.LegGeometry.Precision
	}
	coords := decodePolyline(l.LegGeometry.Points, precision)

	// Replace WALK geometry with accessible routing when possible.
	if l.Mode == "WALK" && wr != nil && len(coords) >= 2 {
		from, to := coords[0], coords[len(coords)-1]
		if routed, err := wr(from[0], from[1], to[0], to[1]); err == nil && len(routed) >= 2 {
			coords = routed
		}
	}

	leg := Leg{
		Mode:      l.Mode,
		Route:     route,
		FromName:  placeName(l.From.Name),
		ToName:    placeName(l.To.Name),
		StartTime: l.StartTime,
		EndTime:   l.EndTime,
		Access:    access,
		Coords:    coords,
	}
	leg.Category = category(leg)
	leg.Label = label(leg)
	return leg
}

// placeName blanks MOTIS's synthetic endpoint names.
func placeName(s string) string {
	if s == "START" || s == "END" {
		return ""
	}
	return s
}

// ── Accessibility semantics ──────────────────────────────────────────────────

// accessOf resolves a transit leg's accessibility. Priority: the city's explicit
// per-trip ACCESSIBLE flag → the per-route category table (eway) → unknown.
// MOTIS's NOT_ACCESSIBLE is ignored as a signal because GTFS 0 = "no
// information" gets collapsed into it.
func accessOf(motisFlag, route string) Access {
	if motisFlag == "ACCESSIBLE" {
		return AccessYes
	}
	if route != "" {
		if a, ok := lvivRouteAccess[routeKey(route)]; ok {
			return a
		}
	}
	return AccessUnknown
}

// routeKey normalises a route name for lookup (latin lookalikes → cyrillic).
func routeKey(route string) string {
	r := strings.NewReplacer("A", "А", "a", "а", "T", "Т", "p", "р")
	return r.Replace(strings.TrimSpace(route))
}

// ── Ranking ──────────────────────────────────────────────────────────────────

var accessRank = map[Access]int{AccessYes: 0, AccessUnknown: 1, AccessNo: 2}

// rankItineraries sorts accessible journeys first — but doesn't bury a much
// faster option: an accessible itinerary is promoted to the top only while it
// takes no more than 2× the fastest non-accessible alternative. Everything else
// sorts by duration, with accessibility as the tiebreak.
func rankItineraries(its []Itinerary) {
	fastestOther := 0
	haveOther := false
	for _, it := range its {
		if it.Access != AccessYes && (!haveOther || it.DurationMin < fastestOther) {
			fastestOther = it.DurationMin
			haveOther = true
		}
	}
	promoted := func(it Itinerary) bool {
		return it.Access == AccessYes && (!haveOther || it.DurationMin <= 2*fastestOther)
	}
	sort.SliceStable(its, func(i, j int) bool {
		a, b := its[i], its[j]
		pa, pb := promoted(a), promoted(b)
		if pa != pb {
			return pa
		}
		if a.DurationMin != b.DurationMin {
			return a.DurationMin < b.DurationMin
		}
		return accessRank[a.Access] < accessRank[b.Access]
	})
}

// ── Vehicle categories ───────────────────────────────────────────────────────

var (
	tramRe = regexp.MustCompile(`^Т\d`)
	railRe = regexp.MustCompile(`(?i)RAIL|TRAIN`)
	numRe  = regexp.MustCompile(`^(\d+)`)
)

// category names the vehicle type, eway-style: Трамвай / Тролейбус / Автобус /
// Маршрутка / Приміський автобус / Метро / Поїзд. Buses vs marshrutkas are told
// apart by the Lviv route table; 100+ numbers are suburban.
func category(l Leg) string {
	if l.Mode == "WALK" {
		return "Пішки"
	}
	r := routeKey(l.Route)
	switch {
	case strings.HasPrefix(r, "Тр"):
		return "Тролейбус"
	case tramRe.MatchString(r) || l.Mode == "TRAM":
		return "Трамвай"
	case railRe.MatchString(l.Mode):
		return "Поїзд"
	case l.Mode == "SUBWAY" || l.Mode == "METRO":
		return "Метро"
	}
	if m := numRe.FindStringSubmatch(r); m != nil {
		if n, err := strconv.Atoi(m[1]); err == nil && n >= 100 {
			return "Приміський автобус"
		}
	}
	if strings.HasPrefix(r, "А") && lvivRouteAccess[r] == AccessNo {
		return "Маршрутка"
	}
	return "Автобус"
}

// label is the display name for a leg: "Маршрутка А43", or just the category
// for walks/unnamed legs.
func label(l Leg) string {
	if l.Route == "" {
		return l.Category
	}
	return l.Category + " " + l.Route
}

// ── Polyline decoding ────────────────────────────────────────────────────────

// decodePolyline decodes a Google-encoded polyline into [lng,lat] pairs.
// precision comes with each MOTIS leg (usually 6).
func decodePolyline(s string, precision int) [][2]float64 {
	f := 1.0
	for i := 0; i < precision; i++ {
		f *= 10
	}
	out := [][2]float64{}
	var lat, lng int64
	for i := 0; i < len(s); {
		for which := 0; which < 2; which++ {
			var result int64
			var shift uint
			var b int64
			for {
				if i >= len(s) {
					return out // truncated input — return what we have
				}
				b = int64(s[i]) - 63
				i++
				result |= (b & 0x1f) << shift
				shift += 5
				if b < 0x20 {
					break
				}
			}
			delta := result >> 1
			if result&1 != 0 {
				delta = ^delta
			}
			if which == 0 {
				lat += delta
			} else {
				lng += delta
			}
		}
		out = append(out, [2]float64{float64(lng) / f, float64(lat) / f})
	}
	return out
}
