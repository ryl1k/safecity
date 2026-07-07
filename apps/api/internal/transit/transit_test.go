package transit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestCovered(t *testing.T) {
	lviv := [2]float64{24.03, 49.84}
	kyiv := [2]float64{30.52, 50.45}
	if !Covered(lviv, [2]float64{24.05, 49.82}) {
		t.Error("Lviv→Lviv should be covered")
	}
	if Covered(lviv, kyiv) || Covered(kyiv, kyiv) {
		t.Error("routes touching Kyiv should not be covered")
	}
}

func TestRouteKey(t *testing.T) {
	// Latin lookalikes normalise to cyrillic.
	for in, want := range map[string]string{
		"A43": "А43", "T04": "Т04", "Tp24": "Тр24", " А08a ": "А08а", "Тр22": "Тр22",
	} {
		if got := routeKey(in); got != want {
			t.Errorf("routeKey(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestAccessOf(t *testing.T) {
	// Explicit per-trip GTFS flag beats the category table (Т08 low-floor trams).
	if got := accessOf("ACCESSIBLE", "Т08"); got != AccessYes {
		t.Errorf("explicit ACCESSIBLE should win, got %s", got)
	}
	// MOTIS NOT_ACCESSIBLE is not a signal — the table decides.
	if got := accessOf("NOT_ACCESSIBLE", "А47"); got != AccessYes {
		t.Errorf("А47 is accessible per eway, got %s", got)
	}
	if got := accessOf("NOT_ACCESSIBLE", "А43"); got != AccessNo {
		t.Errorf("А43 is a marshrutka, got %s", got)
	}
	// Unknown route falls through to unknown.
	if got := accessOf("NOT_ACCESSIBLE", "А777"); got != AccessUnknown {
		t.Errorf("unknown route should be unknown, got %s", got)
	}
}

func TestCategory(t *testing.T) {
	cases := []struct {
		mode, route, want string
	}{
		{"WALK", "", "Пішки"},
		{"BUS", "А47", "Автобус"},
		{"BUS", "А43", "Маршрутка"},
		{"BUS", "Тр24", "Тролейбус"},
		{"TRAM", "Т04", "Трамвай"},
		{"BUS", "127", "Приміський автобус"},
		{"SUBWAY", "М1", "Метро"},
		{"RAIL", "6402", "Поїзд"},
		{"BUS", "A43", "Маршрутка"}, // latin lookalike
	}
	for _, c := range cases {
		got := category(Leg{Mode: c.mode, Route: c.route})
		if got != c.want {
			t.Errorf("category(%s %s) = %s, want %s", c.mode, c.route, got, c.want)
		}
	}
	if got := label(Leg{Mode: "BUS", Route: "А43", Category: "Маршрутка"}); got != "Маршрутка А43" {
		t.Errorf("label = %q", got)
	}
	if got := label(Leg{Mode: "WALK", Category: "Пішки"}); got != "Пішки" {
		t.Errorf("walk label = %q", got)
	}
}

// it builds a minimal itinerary for ranking tests.
func it(access Access, durationMin int) Itinerary {
	return Itinerary{Access: access, DurationMin: durationMin}
}

func key(its []Itinerary) string {
	s := ""
	for _, i := range its {
		s += string(i.Access) + ":" + itoa(i.DurationMin) + " "
	}
	return s
}

func itoa(n int) string { return string(rune('0'+n/10)) + string(rune('0'+n%10)) }

func TestRankItineraries(t *testing.T) {
	cases := []struct {
		name string
		in   []Itinerary
		want string
	}{
		{
			"accessible within 2x stays first",
			[]Itinerary{it(AccessNo, 20), it(AccessYes, 35)},
			"yes:35 no:20 ",
		},
		{
			"accessible beyond 2x falls behind",
			[]Itinerary{it(AccessNo, 20), it(AccessYes, 45)},
			"no:20 yes:45 ",
		},
		{
			"exactly 2x is still promoted",
			[]Itinerary{it(AccessNo, 20), it(AccessYes, 40)},
			"yes:40 no:20 ",
		},
		{
			"mixed: promoted accessible first, rest by duration",
			[]Itinerary{it(AccessYes, 50), it(AccessNo, 22), it(AccessYes, 30), it(AccessUnknown, 25)},
			"yes:30 no:22 unknown:25 yes:50 ",
		},
		{
			"all accessible sorts by duration",
			[]Itinerary{it(AccessYes, 40), it(AccessYes, 25)},
			"yes:25 yes:40 ",
		},
		{
			"no accessible: duration order, access breaks ties",
			[]Itinerary{it(AccessNo, 30), it(AccessUnknown, 30), it(AccessNo, 18)},
			"no:18 unknown:30 no:30 ",
		},
	}
	for _, c := range cases {
		rankItineraries(c.in)
		if got := key(c.in); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

func TestDecodePolyline(t *testing.T) {
	// Canonical Google example at precision 5:
	// (38.5,-120.2) (40.7,-120.95) (43.252,-126.453)
	got := decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5)
	want := [][2]float64{{-120.2, 38.5}, {-120.95, 40.7}, {-126.453, 43.252}}
	if len(got) != len(want) {
		t.Fatalf("decoded %d points, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("point %d = %v, want %v", i, got[i], want[i])
		}
	}
	// Truncated input must not panic and returns the decoded prefix.
	_ = decodePolyline("_p~iF~ps|U_ulL", 5)
}

func TestPlanNotCovered(t *testing.T) {
	c := New("http://unused", time.Second)
	res, err := c.Plan(context.Background(), [2]float64{30.52, 50.45}, [2]float64{30.6, 50.4})
	if err != nil {
		t.Fatalf("not-covered plan should not error: %v", err)
	}
	if res.Covered || res.Notice == "" || len(res.Itineraries) != 0 {
		t.Errorf("unexpected not-covered result: %+v", res)
	}
}

func TestPlanMapsAndRanks(t *testing.T) {
	// Fake MOTIS: a slower fully-accessible option and a faster marshrutka one.
	body := `{"itineraries":[
	  {"duration":3240,"transfers":1,"startTime":"2026-07-02T10:00:00Z","endTime":"2026-07-02T10:54:00Z","legs":[
	    {"mode":"WALK","from":{"name":"START"},"to":{"name":"Зупинка А"},"startTime":"t","endTime":"t",
	     "legGeometry":{"points":"_p~iF~ps|U_ulLnnqC","precision":5}},
	    {"mode":"BUS","routeShortName":"А29","from":{"name":"Зупинка А"},"to":{"name":"Зупинка Б"},
	     "startTime":"t","endTime":"t","wheelchairAccessible":"NOT_ACCESSIBLE","legGeometry":{"points":"","precision":6}}
	  ]},
	  {"duration":3120,"transfers":0,"startTime":"2026-07-02T10:00:00Z","endTime":"2026-07-02T10:52:00Z","legs":[
	    {"mode":"BUS","routeShortName":"А43","from":{"name":"Зупинка В"},"to":{"name":"END"},
	     "startTime":"t","endTime":"t","wheelchairAccessible":"NOT_ACCESSIBLE","legGeometry":{"points":"","precision":6}}
	  ]}
	]}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/plan" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		q := r.URL.Query()
		if q.Get("pedestrianProfile") != "WHEELCHAIR" || q.Get("transitModes") != "BUS,TRAM,SUBWAY" {
			t.Errorf("missing required query params: %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	c := New(srv.URL, time.Second)
	c.now = func() time.Time { return time.Date(2026, 7, 2, 10, 0, 0, 0, time.UTC) }

	res, err := c.Plan(context.Background(), [2]float64{24.0, 49.84}, [2]float64{24.05, 49.82})
	if err != nil {
		t.Fatal(err)
	}
	if !res.Covered || len(res.Itineraries) != 2 {
		t.Fatalf("unexpected result: %+v", res)
	}

	first, second := res.Itineraries[0], res.Itineraries[1]
	// А29 (accessible per eway, 54 min) outranks А43 (marshrutka, 52 min): 54 ≤ 2×52.
	if first.Access != AccessYes || first.DurationMin != 54 {
		t.Errorf("first should be the accessible 54-min itinerary, got %s %d", first.Access, first.DurationMin)
	}
	if second.Access != AccessNo {
		t.Errorf("second should be the marshrutka itinerary, got %s", second.Access)
	}

	// Leg mapping: labels, categories, endpoint blanking, polyline decode.
	walk, bus := first.Legs[0], first.Legs[1]
	if walk.Label != "Пішки" || walk.FromName != "" || walk.ToName != "Зупинка А" {
		t.Errorf("walk leg mapped wrong: %+v", walk)
	}
	if len(walk.Coords) != 2 || walk.Coords[0] != [2]float64{-120.2, 38.5} {
		t.Errorf("walk coords decoded wrong: %v", walk.Coords)
	}
	if bus.Label != "Автобус А29" || bus.Access != AccessYes {
		t.Errorf("bus leg mapped wrong: %+v", bus)
	}
	if second.Legs[0].Label != "Маршрутка А43" || second.Legs[0].ToName != "" {
		t.Errorf("marshrutka leg mapped wrong: %+v", second.Legs[0])
	}
}
