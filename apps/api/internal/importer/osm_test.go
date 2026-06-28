package importer

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func f64(v float64) *float64 { return &v }

func TestCategorize(t *testing.T) {
	cases := []struct {
		tags map[string]string
		want string
	}{
		{map[string]string{"amenity": "toilets"}, "toilet"},
		{map[string]string{"railway": "tram_stop"}, "transit"},
		{map[string]string{"highway": "bus_stop"}, "transit"},
		{map[string]string{"public_transport": "platform"}, "transit"},
		{map[string]string{"highway": "crossing"}, "crossing"},
		{map[string]string{"footway": "crossing"}, "crossing"},
		{map[string]string{"amenity": "parking"}, "parking"},
		{map[string]string{"shop": "bakery"}, "venue"},
	}
	for _, c := range cases {
		if got := categorize(c.tags); got != c.want {
			t.Errorf("categorize(%v) = %q, want %q", c.tags, got, c.want)
		}
	}
}

func TestFeaturesForCrossing(t *testing.T) {
	f := featuresFor("crossing", map[string]string{
		"tactile_paving": "yes", "kerb": "lowered", "traffic_signals:sound": "yes",
	})
	if f["tactile_paving"] != "yes" || f["dropped_curb"] != "yes" || f["acoustic_signal"] != "yes" {
		t.Fatalf("crossing features = %v", f)
	}
}

func TestFeaturesForTransitAndParking(t *testing.T) {
	tr := featuresFor("transit", map[string]string{"wheelchair": "limited"})
	if tr["level_boarding"] != "no" || tr["step_free_to_stop"] != "no" { // "limited" → no
		t.Fatalf("transit features = %v", tr)
	}
	pk := featuresFor("parking", map[string]string{"capacity:disabled": "3"})
	if pk["disabled_bay"] != "yes" {
		t.Fatalf("parking features = %v", pk)
	}
}

func TestNameFor(t *testing.T) {
	if got := nameFor("transit", map[string]string{"railway": "tram_stop"}); got != "Зупинка трамвая" {
		t.Fatalf("tram name = %q", got)
	}
	if got := nameFor("toilet", map[string]string{}); got != "Громадський туалет" {
		t.Fatalf("toilet default = %q", got)
	}
	if got := nameFor("venue", map[string]string{}); got != "" {
		t.Fatalf("nameless venue should be empty, got %q", got)
	}
	if got := nameFor("venue", map[string]string{"name": "Кафе"}); got != "Кафе" {
		t.Fatalf("named venue = %q", got)
	}
}

func TestAddressFor(t *testing.T) {
	if got := addressFor(map[string]string{"addr:street": "Ринок", "addr:housenumber": "1"}); got != "Ринок, 1" {
		t.Fatalf("address = %q", got)
	}
	if got := addressFor(map[string]string{"addr:street": "Ринок"}); got != "Ринок" {
		t.Fatalf("street-only = %q", got)
	}
	if got := addressFor(map[string]string{}); got != "" {
		t.Fatalf("no address = %q", got)
	}
}

func TestMapElement(t *testing.T) {
	// node with lat/lon
	rec, feats, ok := mapElement(OSMElement{
		Type: "node", ID: 42, Lat: f64(49.84), Lon: f64(24.03),
		Tags: map[string]string{"amenity": "toilets", "wheelchair": "yes"},
	})
	if !ok || rec.OSMID != "node/42" || rec.Category != "toilet" || rec.VerifyStatus != "verified" {
		t.Fatalf("rec = %+v ok=%v", rec, ok)
	}
	if rec.Lng != 24.03 || rec.Lat != 49.84 {
		t.Fatalf("coords = %v/%v", rec.Lng, rec.Lat)
	}
	if feats["accessible_stall"] != "yes" {
		t.Fatalf("feats = %v", feats)
	}

	// way with center
	wrec, _, ok := mapElement(OSMElement{
		Type: "way", ID: 7, Center: &struct {
			Lat float64 `json:"lat"`
			Lon float64 `json:"lon"`
		}{Lat: 49.85, Lon: 24.04},
		Tags: map[string]string{"wheelchair": "yes", "name": "Музей"},
	})
	if !ok || wrec.OSMID != "way/7" || wrec.Lat != 49.85 {
		t.Fatalf("way rec = %+v ok=%v", wrec, ok)
	}

	// no coords → skip
	if _, _, ok := mapElement(OSMElement{Type: "node", ID: 1, Tags: map[string]string{"amenity": "toilets"}}); ok {
		t.Fatal("element without coords should be skipped")
	}
	// venue without name → skip
	if _, _, ok := mapElement(OSMElement{Type: "node", ID: 2, Lat: f64(49.8), Lon: f64(24.0), Tags: map[string]string{"shop": "bakery"}}); ok {
		t.Fatal("nameless venue should be skipped")
	}
}

func TestOverpassQueryHasBBox(t *testing.T) {
	q := overpassQuery("49.80,23.98,49.86,24.06")
	if !strings.Contains(q, "49.80,23.98,49.86,24.06") || !strings.Contains(q, "out center 800;") {
		t.Fatalf("query missing bbox/footer: %s", q)
	}
}

func TestFetchOverpass(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		if !strings.HasPrefix(string(b), "data=") {
			t.Errorf("expected form-encoded data= body, got %q", string(b))
		}
		_, _ = io.WriteString(w, `{"elements":[{"type":"node","id":1,"lat":49.8,"lon":24.0,"tags":{"amenity":"toilets"}}]}`)
	}))
	defer srv.Close()
	els, err := fetchOverpass(context.Background(), srv.Client(), srv.URL, DefaultBBox)
	if err != nil {
		t.Fatalf("fetchOverpass: %v", err)
	}
	if len(els) != 1 || els[0].ID != 1 {
		t.Fatalf("elements = %+v", els)
	}
}
