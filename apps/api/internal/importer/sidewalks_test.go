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
			"name": "Вулиця Франка", "surface": "asphalt", "lit": "yes",
			"wheelchair": "yes", "incline": "5%", "kerb": "lowered",
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
	if rec.VerifyStatus != "verified" {
		t.Fatalf("verifyStatus = %q", rec.VerifyStatus)
	}
	if len(rec.Coords) != 2 || rec.Coords[0] != [2]float64{24.03, 49.84} {
		t.Fatalf("coords = %v", rec.Coords)
	}
}

func TestMapSidewalkWayWheelchairVariants(t *testing.T) {
	base := geom([2]float64{49.8, 24.0}, [2]float64{49.81, 24.01})

	limited, ok := mapSidewalkWay(SidewalkElement{ID: 1, Geometry: base, Tags: map[string]string{"name": "T", "wheelchair": "limited"}})
	if !ok || limited.IsStepFree == nil || *limited.IsStepFree {
		t.Fatalf("wheelchair=limited should map to IsStepFree=false, got %+v", limited)
	}

	no, ok := mapSidewalkWay(SidewalkElement{ID: 2, Geometry: base, Tags: map[string]string{"name": "T", "wheelchair": "no"}})
	if !ok || no.IsStepFree == nil || *no.IsStepFree {
		t.Fatalf("wheelchair=no should map to IsStepFree=false, got %+v", no)
	}

	missing, ok := mapSidewalkWay(SidewalkElement{ID: 3, Geometry: base, Tags: map[string]string{"name": "T"}})
	if !ok || missing.IsStepFree != nil {
		t.Fatalf("missing wheelchair tag should leave IsStepFree nil, got %+v", missing)
	}
}

func TestMapSidewalkWaySkipsNoName(t *testing.T) {
	if _, ok := mapSidewalkWay(SidewalkElement{
		ID:       1,
		Geometry: geom([2]float64{1, 2}, [2]float64{3, 4}),
		Tags:     map[string]string{"surface": "asphalt"},
	}); ok {
		t.Fatal("way without name should be skipped")
	}
}

func TestMapSidewalkWaySkipsShortGeometry(t *testing.T) {
	if _, ok := mapSidewalkWay(SidewalkElement{
		ID:       1,
		Geometry: geom([2]float64{1, 2}),
		Tags:     map[string]string{"name": "T"},
	}); ok {
		t.Fatal("way with fewer than 2 geometry points should be skipped")
	}
}

func TestMapSidewalkWayMissingOptionalTags(t *testing.T) {
	rec, ok := mapSidewalkWay(SidewalkElement{
		ID:       5,
		Geometry: geom([2]float64{49.8, 24.0}, [2]float64{49.81, 24.01}),
		Tags:     map[string]string{"name": "T"},
	})
	if !ok {
		t.Fatal("expected ok")
	}
	if rec.SurfaceType != nil || rec.Lit != nil || rec.IsStepFree != nil || rec.InclinePercent != nil || rec.HasCurbCuts != nil {
		t.Fatalf("missing optional tags should leave pointers nil, got %+v", rec)
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

func TestFetchSidewalks(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		if !strings.HasPrefix(string(b), "data=") {
			t.Errorf("expected form-encoded data= body, got %q", string(b))
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
