// Package geo proxies OpenRouteService (routing) and Nominatim (geocoding),
// keeping API keys server-side and adding timeouts + geocode caching. Base URLs
// are configurable so ORS/Nominatim can be self-hosted later.
package geo

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// userAgent identifies the service to Nominatim, whose usage policy requires a
// real UA (it rejects requests without one).
const userAgent = "SafeCity/1.0 (+https://safecity.lviv)"

// ErrUnavailable means the upstream is not configured (e.g. missing ORS key).
var ErrUnavailable = errors.New("routing service unavailable")

// ErrNoRoute means ORS found no path — usually because avoidance polygons or
// accessibility restrictions over-constrained the request. Callers can retry
// with a looser avoid set. Distinct from a transport/decoding failure.
var ErrNoRoute = errors.New("no route found")

// Client talks to ORS + Nominatim.
type Client struct {
	http         *http.Client
	orsKey       string
	orsBase      string
	nominatimURL string
	geoCache     *ttlCache
}

// New builds a Client. timeout bounds each upstream call.
func New(orsKey, orsBase, nominatimURL string, timeout time.Duration) *Client {
	return &Client{
		http:         &http.Client{Timeout: timeout},
		orsKey:       strings.TrimSpace(orsKey),
		orsBase:      strings.TrimRight(orsBase, "/"),
		nominatimURL: strings.TrimRight(nominatimURL, "/"),
		geoCache:     newTTLCache(10 * time.Minute),
	}
}

// ── Routing ──────────────────────────────────────────────────────────────────

// Restrictions are the wheelchair accessibility limits (ignored by foot profile).
type Restrictions struct {
	MaxIncline    float64
	MaxSlopedKerb float64
	MinWidth      float64
}

// DefaultRestrictions mirror the web's defaults.
func DefaultRestrictions() Restrictions {
	return Restrictions{MaxIncline: 6, MaxSlopedKerb: 0.03, MinWidth: 0.8}
}

// RouteInput is a routing request. Profile is the wanted ORS profile
// ("wheelchair" or "foot-walking"); wheelchair falls back to foot-walking.
type RouteInput struct {
	From         [2]float64 // [lng,lat]
	To           [2]float64
	Via          [][2]float64 // optional intermediate waypoints, in order
	Profile      string
	Restrictions Restrictions    // applied only for wheelchair
	Avoid        [][][][]float64 // GeoJSON MultiPolygon coordinates
}

// Step is one navigation instruction.
type Step struct {
	Instruction string  `json:"instruction"`
	Distance    float64 `json:"distance"`
}

// Summary is the route total.
type Summary struct {
	Distance float64 `json:"distance"`
	Duration float64 `json:"duration"`
}

// RouteResult is the shaped response (matches the web's /api/route).
type RouteResult struct {
	Profile     string      `json:"profile"`
	Source      string      `json:"source"`     // "pgrouting" | "ors" | "ors-fallback"
	Fallback    bool        `json:"fallback"`
	Avoided     int         `json:"avoided"`
	CrossesRed  int         `json:"crossesRed"` // inaccessible segments the final route still runs along
	Coordinates [][]float64 `json:"coordinates"`
	Steps       []Step      `json:"steps"`
	Summary     *Summary    `json:"summary"`
}

// Route calls ORS, falling back from wheelchair to foot-walking when the
// wheelchair profile can't find a path (Lviv OSM data is often incomplete).
func (c *Client) Route(ctx context.Context, in RouteInput) (RouteResult, error) {
	if c.orsKey == "" {
		return RouteResult{}, ErrUnavailable
	}
	wanted := in.Profile
	if wanted == "" {
		wanted = "wheelchair"
	}

	used := wanted
	body, status, err := c.orsCall(ctx, wanted, in)
	if err != nil {
		return RouteResult{}, err
	}
	if status != http.StatusOK && wanted == "wheelchair" {
		used = "foot-walking"
		body, status, err = c.orsCall(ctx, used, in)
		if err != nil {
			return RouteResult{}, err
		}
	}
	if status == http.StatusNotFound {
		// ORS code 2009 "route could not be found" — over-constrained. Retryable.
		return RouteResult{}, ErrNoRoute
	}
	if status != http.StatusOK {
		return RouteResult{}, fmt.Errorf("ors routing failed (status %d): %s", status, truncate(string(body), 300))
	}

	var gj orsGeoJSON
	if err := json.Unmarshal(body, &gj); err != nil {
		return RouteResult{}, fmt.Errorf("decode ors response: %w", err)
	}
	orsSource := "ors"
	if used != wanted {
		orsSource = "ors-fallback"
	}
	res := RouteResult{
		Profile:     used,
		Source:      orsSource,
		Fallback:    used != wanted,
		Avoided:     len(in.Avoid),
		Coordinates: [][]float64{},
		Steps:       []Step{},
	}
	if len(gj.Features) > 0 {
		f := gj.Features[0]
		if f.Geometry.Coordinates != nil {
			res.Coordinates = f.Geometry.Coordinates
		}
		if f.Properties.Summary != nil {
			res.Summary = f.Properties.Summary
		}
		if len(f.Properties.Segments) > 0 {
			seg := f.Properties.Segments[0]
			for _, s := range seg.Steps {
				res.Steps = append(res.Steps, Step{Instruction: uaInstruction(s.Type, s.Name), Distance: s.Distance})
			}
			if res.Summary == nil {
				res.Summary = &Summary{Distance: seg.Distance, Duration: seg.Duration}
			}
		}
	}
	return res, nil
}

func (c *Client) orsCall(ctx context.Context, profile string, in RouteInput) ([]byte, int, error) {
	coords := make([][2]float64, 0, len(in.Via)+2)
	coords = append(coords, in.From)
	coords = append(coords, in.Via...)
	coords = append(coords, in.To)
	payload := map[string]any{"coordinates": coords}
	options := map[string]any{}
	if len(in.Avoid) > 0 {
		options["avoid_polygons"] = map[string]any{"type": "MultiPolygon", "coordinates": in.Avoid}
	}
	if profile == "wheelchair" {
		options["profile_params"] = map[string]any{
			"restrictions": map[string]any{
				"maximum_incline":     in.Restrictions.MaxIncline,
				"maximum_sloped_kerb": in.Restrictions.MaxSlopedKerb,
				"minimum_width":       in.Restrictions.MinWidth,
			},
		}
	}
	if len(options) > 0 {
		payload["options"] = options
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, err
	}
	endpoint := fmt.Sprintf("%s/v2/directions/%s/geojson", c.orsBase, profile)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(raw))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", c.orsKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("ors request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	out, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, 0, fmt.Errorf("read ors body: %w", err)
	}
	return out, resp.StatusCode, nil
}

type orsGeoJSON struct {
	Features []struct {
		Geometry struct {
			Coordinates [][]float64 `json:"coordinates"`
		} `json:"geometry"`
		Properties struct {
			Summary  *Summary `json:"summary"`
			Segments []struct {
				Distance float64 `json:"distance"`
				Duration float64 `json:"duration"`
				Steps    []struct {
					Instruction string  `json:"instruction"`
					Distance    float64 `json:"distance"`
					Type        int     `json:"type"`
					Name        string  `json:"name"`
				} `json:"steps"`
			} `json:"segments"`
		} `json:"properties"`
	} `json:"features"`
}

// uaInstruction renders a Ukrainian turn-by-turn line from ORS's maneuver type
// + way name (the public ORS API has no Ukrainian instruction language, and
// street names already come back in Ukrainian from OSM).
func uaInstruction(t int, name string) string {
	if name == "-" { // ORS uses "-" for unnamed ways
		name = ""
	}
	on := func(v string) string {
		if name != "" {
			return v + " на " + name
		}
		return v
	}
	switch t {
	case 0:
		return on("Поверніть ліворуч")
	case 1:
		return on("Поверніть праворуч")
	case 2:
		return on("Крутий поворот ліворуч")
	case 3:
		return on("Крутий поворот праворуч")
	case 4:
		return on("Тримайтеся трохи лівіше")
	case 5:
		return on("Тримайтеся трохи правіше")
	case 6:
		if name != "" {
			return "Прямо по " + name
		}
		return "Прямо"
	case 7:
		return "Заїзд на кільце"
	case 8:
		return "З’їзд з кільця"
	case 9:
		return "Розворот"
	case 10:
		return "Прибуття до місця призначення"
	case 11:
		if name != "" {
			return "Рушайте по " + name
		}
		return "Рушайте"
	case 12:
		return on("Тримайтеся лівіше")
	case 13:
		return on("Тримайтеся правіше")
	default:
		return "Продовжуйте рух"
	}
}

// AvoidSquares turns barrier points into ~30 m square avoidance polygons (a
// GeoJSON MultiPolygon coordinate set), matching the web's avoidSquare.
func AvoidSquares(points [][2]float64) [][][][]float64 {
	const d = 0.0002
	out := make([][][][]float64, 0, len(points))
	for _, p := range points {
		lng, lat := p[0], p[1]
		ring := [][]float64{
			{lng - d, lat - d},
			{lng + d, lat - d},
			{lng + d, lat + d},
			{lng - d, lat + d},
			{lng - d, lat - d},
		}
		out = append(out, [][][]float64{ring})
	}
	return out
}

// ── Geocoding ────────────────────────────────────────────────────────────────

// Place is a geocoding result.
type Place struct {
	ID    string  `json:"id"`
	Label string  `json:"label"`
	Lng   float64 `json:"lng"`
	Lat   float64 `json:"lat"`
}

// viewbox biases results toward Ukraine without hard-locking (minLng,maxLat,maxLng,minLat).
const viewbox = "22.0,52.5,40.5,44.0"

// Geocode resolves a free-text query to places (cached). Returns an empty slice
// for queries shorter than 3 chars, matching the web.
func (c *Client) Geocode(ctx context.Context, query string, limit int) ([]Place, error) {
	q := strings.TrimSpace(query)
	if len(q) < 3 {
		return []Place{}, nil
	}
	if limit <= 0 || limit > 10 {
		limit = 5
	}
	cacheKey := strconv.Itoa(limit) + ":" + strings.ToLower(q)
	if v, ok := c.geoCache.get(cacheKey); ok {
		return v, nil
	}

	u := fmt.Sprintf("%s/search?format=jsonv2&q=%s&limit=%d&accept-language=uk&countrycodes=ua&viewbox=%s&bounded=0",
		c.nominatimURL, url.QueryEscape(q), limit, viewbox)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", userAgent) // required by Nominatim policy

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("nominatim request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("nominatim status %d", resp.StatusCode)
	}
	var rows []struct {
		PlaceID int    `json:"place_id"`
		Display string `json:"display_name"`
		Lon     string `json:"lon"`
		Lat     string `json:"lat"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&rows); err != nil {
		return nil, fmt.Errorf("decode nominatim: %w", err)
	}

	places := make([]Place, 0, len(rows))
	for _, r := range rows {
		lng, _ := strconv.ParseFloat(r.Lon, 64)
		lat, _ := strconv.ParseFloat(r.Lat, 64)
		places = append(places, Place{
			ID:    fmt.Sprintf("osm-%d", r.PlaceID),
			Label: trimLabel(r.Display),
			Lng:   lng,
			Lat:   lat,
		})
	}
	c.geoCache.set(cacheKey, places)
	return places, nil
}

// Reverse resolves coordinates to a single nearby address (cached). Returns nil
// when Nominatim has no result for the spot (e.g. open water).
func (c *Client) Reverse(ctx context.Context, lng, lat float64) (*Place, error) {
	cacheKey := fmt.Sprintf("rev:%.5f,%.5f", lng, lat)
	if v, ok := c.geoCache.get(cacheKey); ok {
		if len(v) == 0 {
			return nil, nil
		}
		return &v[0], nil
	}

	u := fmt.Sprintf("%s/reverse?format=jsonv2&lon=%s&lat=%s&accept-language=uk&zoom=18&addressdetails=1",
		c.nominatimURL,
		strconv.FormatFloat(lng, 'f', -1, 64), strconv.FormatFloat(lat, 'f', -1, 64))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", userAgent) // required by Nominatim policy

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("nominatim reverse request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("nominatim reverse status %d", resp.StatusCode)
	}
	var row struct {
		PlaceID int               `json:"place_id"`
		Display string            `json:"display_name"`
		Name    string            `json:"name"`
		Lon     string            `json:"lon"`
		Lat     string            `json:"lat"`
		Address map[string]string `json:"address"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&row); err != nil {
		return nil, fmt.Errorf("decode nominatim reverse: %w", err)
	}
	label := shortAddress(row.Name, row.Address, row.Display)
	if strings.TrimSpace(label) == "" {
		c.geoCache.set(cacheKey, []Place{}) // cache the "no result" too
		return nil, nil
	}
	rlng, _ := strconv.ParseFloat(row.Lon, 64)
	rlat, _ := strconv.ParseFloat(row.Lat, 64)
	p := Place{ID: fmt.Sprintf("osm-%d", row.PlaceID), Label: label, Lng: rlng, Lat: rlat}
	c.geoCache.set(cacheKey, []Place{p})
	return &p, nil
}

// shortAddress builds a compact label — street + house number (+ the feature's
// own name), or a locality when there's no street (rural). Drops city/oblast/
// postcode/country noise. Falls back to the full display name if nothing usable.
func shortAddress(name string, a map[string]string, fallback string) string {
	if a == nil {
		return fallback
	}
	road := a["road"]
	if road == "" {
		road = a["pedestrian"]
	}
	street := road
	if road != "" {
		if hn := a["house_number"]; hn != "" {
			street = road + ", " + hn
		}
	} else {
		for _, k := range []string{"suburb", "neighbourhood", "city_district", "hamlet", "village", "town", "city"} {
			if v := a[k]; v != "" {
				street = v
				break
			}
		}
	}
	parts := make([]string, 0, 2)
	if name != "" && name != road {
		parts = append(parts, name)
	}
	if street != "" {
		parts = append(parts, street)
	}
	if len(parts) == 0 {
		return fallback
	}
	return strings.Join(parts, ", ")
}

// dropLabelPart matches the admin tail of a Nominatim display name
// (oblast/raion/hromada/postcode/country) that only adds noise for users.
var dropLabelPart = regexp.MustCompile(`(?i)область|район|громад|Україна|^\d{4,6}$`)

// trimLabel keeps the first few meaningful parts of a full display name for
// search results (street, locality) and drops the admin tail.
func trimLabel(s string) string {
	kept := make([]string, 0, 3)
	for _, p := range strings.Split(s, ",") {
		p = strings.TrimSpace(p)
		if p == "" || dropLabelPart.MatchString(p) {
			continue
		}
		kept = append(kept, p)
		if len(kept) == 3 {
			break
		}
	}
	if len(kept) == 0 {
		return s
	}
	return strings.Join(kept, ", ")
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n] + "…"
	}
	return s
}

// ── tiny TTL cache ───────────────────────────────────────────────────────────

type ttlCache struct {
	mu  sync.Mutex
	ttl time.Duration
	m   map[string]cacheEntry
	now func() time.Time
}

type cacheEntry struct {
	val []Place
	exp time.Time
}

func newTTLCache(ttl time.Duration) *ttlCache {
	return &ttlCache{ttl: ttl, m: make(map[string]cacheEntry), now: time.Now}
}

func (c *ttlCache) get(key string) ([]Place, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	if !ok || c.now().After(e.exp) {
		if ok {
			delete(c.m, key)
		}
		return nil, false
	}
	return e.val, true
}

func (c *ttlCache) set(key string, val []Place) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[key] = cacheEntry{val: val, exp: c.now().Add(c.ttl)}
}
