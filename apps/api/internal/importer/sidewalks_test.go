package importer

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func geom(pts ...[2]float64) []struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
} {
	out := make([]struct {
		Lat float64 `json:"lat"`
		Lon float64 `json:"lon"`
	}, len(pts))
	for i, p := range pts {
		out[i] = struct {
			Lat float64 `json:"lat"`
			Lon float64 `json:"lon"`
		}{Lat: p[0], Lon: p[1]}
	}
	return out
}

func TestMapSidewalkWay(t *testing.T) {
	rec, ok := mapSidewalkWay(SidewalkElement{
		ID:       100,
		Geometry: geom([2]float64{49.84, 24.03}, [2]float64{49.841, 24.031}),
		Tags: map[string]string{
			"name": "Вулиця Франка", "surface": "asphalt", "smoothness": "good",
			"width": "2.0 m", "lit": "yes", "wheelchair": "yes", "incline": "5%",
			"kerb": "lowered", "tactile_paving": "yes",
		},
	})
	if !ok {
		t.Fatal("expected ok")
	}
	if rec.StreetName != "Вулиця Франка" || rec.OSMWayID != 100 {
		t.Fatalf("rec = %+v", rec)
	}
	if rec.SurfaceType == nil || *rec.SurfaceType != "asphalt" {
		t.Fatalf("surface = %v", rec.SurfaceType)
	}
	if rec.Smoothness == nil || *rec.Smoothness != "good" {
		t.Fatalf("smoothness = %v", rec.Smoothness)
	}
	if rec.SidewalkWidthM == nil || *rec.SidewalkWidthM != 2.0 {
		t.Fatalf("width = %v", rec.SidewalkWidthM)
	}
	if rec.Lit == nil || !*rec.Lit {
		t.Fatalf("lit = %v", rec.Lit)
	}
	if rec.IsStepFree == nil || !*rec.IsStepFree {
		t.Fatalf("isStepFree = %v", rec.IsStepFree)
	}
	if rec.InclinePercent == nil || *rec.InclinePercent != 5 {
		t.Fatalf("incline = %v", rec.InclinePercent)
	}
	if rec.HasCurbCuts == nil || !*rec.HasCurbCuts {
		t.Fatalf("curbCuts = %v", rec.HasCurbCuts)
	}
	if rec.HasTactilePaving == nil || !*rec.HasTactilePaving {
		t.Fatalf("tactilePaving = %v", rec.HasTactilePaving)
	}
	if rec.VerifyStatus != "unverified" {
		t.Fatalf("verifyStatus = %q (OSM data must never be marked verified)", rec.VerifyStatus)
	}
	if len(rec.Coords) != 2 || rec.Coords[0] != [2]float64{24.03, 49.84} {
		t.Fatalf("coords = %v", rec.Coords)
	}
}

func TestMapSidewalkWayWheelchairVariants(t *testing.T) {
	base := geom([2]float64{49.8, 24.0}, [2]float64{49.81, 24.01})

	// wheelchair=no is a ratable barrier signal → kept, IsStepFree=false.
	no, ok := mapSidewalkWay(SidewalkElement{ID: 2, Geometry: base, Tags: map[string]string{"name": "T", "wheelchair": "no"}})
	if !ok || no.IsStepFree == nil || *no.IsStepFree {
		t.Fatalf("wheelchair=no should be kept with IsStepFree=false, got ok=%v %+v", ok, no)
	}

	// wheelchair=yes → kept, IsStepFree=true.
	yes, ok := mapSidewalkWay(SidewalkElement{ID: 4, Geometry: base, Tags: map[string]string{"name": "T", "wheelchair": "yes"}})
	if !ok || yes.IsStepFree == nil || !*yes.IsStepFree {
		t.Fatalf("wheelchair=yes should be kept with IsStepFree=true, got ok=%v %+v", ok, yes)
	}

	// wheelchair=limited is too ambiguous to rate on its own → gated out.
	if _, ok := mapSidewalkWay(SidewalkElement{ID: 1, Geometry: base, Tags: map[string]string{"name": "T", "wheelchair": "limited"}}); ok {
		t.Fatal("wheelchair=limited with no other signal should be skipped")
	}
}

func TestMapSidewalkWayGate(t *testing.T) {
	base := geom([2]float64{49.8, 24.0}, [2]float64{49.81, 24.01})

	// No rollability signal (name only) → skipped, even with geometry.
	if _, ok := mapSidewalkWay(SidewalkElement{ID: 1, Geometry: base, Tags: map[string]string{"name": "проспект Шевченка"}}); ok {
		t.Fatal("a named way with no surface/smoothness/wheelchair should be skipped")
	}

	// Width alone is only a modifier, never sufficient → skipped.
	if _, ok := mapSidewalkWay(SidewalkElement{ID: 2, Geometry: base, Tags: map[string]string{"name": "T", "width": "2.0"}}); ok {
		t.Fatal("width alone is not a ratable signal; should be skipped")
	}

	// Freeform/unknown surface is dropped and, with nothing else, gates out.
	if _, ok := mapSidewalkWay(SidewalkElement{ID: 3, Geometry: base, Tags: map[string]string{"name": "T", "surface": "узбіччя_дороги"}}); ok {
		t.Fatal("unrecognized freeform surface should not count as signal")
	}

	// A nameless way with a real surface is KEPT with a generic label.
	rec, ok := mapSidewalkWay(SidewalkElement{ID: 4, Geometry: base, Tags: map[string]string{"footway": "sidewalk", "surface": "asphalt"}})
	if !ok {
		t.Fatal("nameless way with a real surface should be kept")
	}
	if rec.StreetName != "Тротуар" {
		t.Fatalf("nameless footway=sidewalk should get generic name 'Тротуар', got %q", rec.StreetName)
	}
	if rec.SurfaceType == nil || *rec.SurfaceType != "asphalt" {
		t.Fatalf("surface = %v", rec.SurfaceType)
	}
}

func TestMapSidewalkWaySkipsShortGeometry(t *testing.T) {
	if _, ok := mapSidewalkWay(SidewalkElement{
		ID:       1,
		Geometry: geom([2]float64{1, 2}),
		Tags:     map[string]string{"name": "T", "surface": "asphalt"},
	}); ok {
		t.Fatal("way with fewer than 2 geometry points should be skipped")
	}
}

func TestMapSidewalkWayMissingOptionalTags(t *testing.T) {
	// Surface present (passes the gate) but every other optional tag missing —
	// those pointers must stay nil rather than default to a value.
	rec, ok := mapSidewalkWay(SidewalkElement{
		ID:       5,
		Geometry: geom([2]float64{49.8, 24.0}, [2]float64{49.81, 24.01}),
		Tags:     map[string]string{"name": "T", "surface": "asphalt"},
	})
	if !ok {
		t.Fatal("expected ok")
	}
	if rec.Smoothness != nil || rec.SidewalkWidthM != nil || rec.Lit != nil ||
		rec.IsStepFree != nil || rec.InclinePercent != nil || rec.HasCurbCuts != nil ||
		rec.HasTactilePaving != nil {
		t.Fatalf("missing optional tags should leave pointers nil, got %+v", rec)
	}
}

func TestRecognizedSurface(t *testing.T) {
	if recognizedSurface("asphalt") == nil || recognizedSurface("sett") == nil || recognizedSurface("gravel") == nil {
		t.Fatal("known surfaces should be recognized")
	}
	if recognizedSurface("узбіччя_дороги") != nil || recognizedSurface("") != nil {
		t.Fatal("freeform/empty surfaces should not be recognized")
	}
}

func TestParseWidthMeters(t *testing.T) {
	cases := []struct {
		in     string
		want   float64
		wantOK bool
	}{
		{"1.5", 1.5, true},
		{"1,5", 1.5, true},
		{"2.0 m", 2.0, true},
		{"0.9m", 0.9, true},
		{"", 0, false},
		{"3'6\"", 0, false},
		{"1.0-2.0", 0, false},
		{"wide", 0, false},
	}
	for _, c := range cases {
		got, ok := parseWidthMeters(c.in)
		if ok != c.wantOK || (ok && got != c.want) {
			t.Errorf("parseWidthMeters(%q) = %v,%v; want %v,%v", c.in, got, ok, c.want, c.wantOK)
		}
	}
}

func TestParseInclinePercent(t *testing.T) {
	cases := []struct {
		in     string
		want   float64
		wantOK bool
	}{
		{"5%", 5, true},
		{"5", 5, true},
		{"-3.5%", -3.5, true},
		{" 8 % ", 8, true},
		{"", 0, false},
		{"up", 0, false},
		{"down", 0, false},
	}
	for _, c := range cases {
		got, ok := parseInclinePercent(c.in)
		if ok != c.wantOK || (ok && got != c.want) {
			t.Errorf("parseInclinePercent(%q) = %v,%v; want %v,%v", c.in, got, ok, c.want, c.wantOK)
		}
	}
}

func TestKerbToHasCurbCuts(t *testing.T) {
	tr, fa := true, false
	cases := []struct {
		in   string
		want *bool
	}{
		{"lowered", &tr},
		{"flush", &tr},
		{"raised", &fa},
		{"", nil},
		{"rolled", nil},
	}
	for _, c := range cases {
		got := kerbToHasCurbCuts(c.in)
		if (got == nil) != (c.want == nil) || (got != nil && *got != *c.want) {
			t.Errorf("kerbToHasCurbCuts(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestSegmentCoordsToWKT(t *testing.T) {
	wkt := segmentCoordsToWKT([][2]float64{{24.03, 49.84}, {24.031, 49.841}})
	want := "LINESTRING(24.0300000 49.8400000,24.0310000 49.8410000)"
	if wkt != want {
		t.Fatalf("wkt = %q, want %q", wkt, want)
	}
}

func TestSidewalkQueryHasBBoxAndGeom(t *testing.T) {
	q := sidewalkQuery("49.80,23.98,49.86,24.06")
	if !strings.Contains(q, "49.80,23.98,49.86,24.06") || !strings.Contains(q, "out geom;") {
		t.Fatalf("query missing bbox/footer: %s", q)
	}
}

func TestCapRecords(t *testing.T) {
	recs := []SegmentRecord{{OSMWayID: 1}, {OSMWayID: 2}, {OSMWayID: 3}}
	if got := capRecords(recs, 0); len(got) != 3 {
		t.Fatalf("cap<=0 should be unlimited, got %d", len(got))
	}
	if got := capRecords(recs, 2); len(got) != 2 || got[0].OSMWayID != 1 || got[1].OSMWayID != 2 {
		t.Fatalf("cap=2 = %+v", got)
	}
	if got := capRecords(recs, 10); len(got) != 3 {
		t.Fatalf("cap larger than input should return everything, got %d", len(got))
	}
}

func TestCitiesIntegrity(t *testing.T) {
	if len(Cities) != 75 {
		t.Fatalf("expected 75 cities, got %d", len(Cities))
	}
	seen := make(map[string]bool, len(Cities))
	for _, c := range Cities {
		if c.ID == "" || c.Name == "" {
			t.Fatalf("city missing id/name: %+v", c)
		}
		if seen[c.ID] {
			t.Fatalf("duplicate city id %q", c.ID)
		}
		seen[c.ID] = true
		if c.Lat < 44 || c.Lat > 53 || c.Lng < 21 || c.Lng > 41 {
			t.Errorf("city %s coords out of Ukraine's bounds: %v,%v", c.ID, c.Lat, c.Lng)
		}
	}
	if Cities[4].ID != "lviv" {
		t.Fatalf("expected Cities[4] to be lviv (matches cities.ts order), got %q", Cities[4].ID)
	}
}

func TestCityBBox(t *testing.T) {
	lviv := City{ID: "lviv", Name: "Львів", Lng: 24.0250, Lat: 49.8389}
	got := CityBBox(lviv)
	want := "49.7189,23.8450,49.9589,24.2050"
	if got != want {
		t.Fatalf("CityBBox(lviv) = %q, want %q", got, want)
	}
}

func TestFetchSidewalks(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		if !strings.HasPrefix(string(b), "data=") {
			t.Errorf("expected form-encoded data= body, got %q", string(b))
		}
		// Overpass (and similar OSM-adjacent services) reject requests with no
		// descriptive User-Agent — this is the header that fixed the live 406s.
		if ua := r.Header.Get("User-Agent"); ua != userAgent {
			t.Errorf("User-Agent = %q, want %q", ua, userAgent)
		}
		_, _ = io.WriteString(w, `{"elements":[{"type":"way","id":1,"geometry":[{"lat":49.8,"lon":24.0},{"lat":49.81,"lon":24.01}],"tags":{"name":"T"}}]}`)
	}))
	defer srv.Close()
	els, err := fetchSidewalks(context.Background(), srv.Client(), srv.URL, DefaultBBox)
	if err != nil {
		t.Fatalf("fetchSidewalks: %v", err)
	}
	if len(els) != 1 || els[0].ID != 1 || len(els[0].Geometry) != 2 {
		t.Fatalf("elements = %+v", els)
	}
}
