package importer

import "testing"

const sampleKML = `<?xml version="1.0"?>
<kml><Document>
  <Folder>
    <Placemark>
      <name><![CDATA[Кав'ярня &amp; Co]]></name>
      <description>Nice &lt;b&gt;place&lt;/b&gt;</description>
      <Point><coordinates>24.0316,49.8419,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Line feature</name>
      <LineString><coordinates>
        24.10,49.90,0 24.11,49.91,0
      </coordinates></LineString>
    </Placemark>
    <Placemark>
      <description>no name or coords</description>
    </Placemark>
  </Folder>
</Document></kml>`

func TestParsePlacemarks(t *testing.T) {
	pms := ParsePlacemarks(sampleKML)
	if len(pms) != 2 {
		t.Fatalf("got %d placemarks, want 2: %+v", len(pms), pms)
	}

	first := pms[0]
	if first.Name != "Кав'ярня & Co" { // CDATA + entity decoded
		t.Fatalf("name = %q", first.Name)
	}
	if first.Description != "Nice <b>place</b>" {
		t.Fatalf("description = %q", first.Description)
	}
	if first.Lng != 24.0316 || first.Lat != 49.8419 {
		t.Fatalf("coords = %v/%v", first.Lng, first.Lat)
	}

	// Line feature: takes the first vertex.
	if pms[1].Lng != 24.10 || pms[1].Lat != 49.90 {
		t.Fatalf("line first vertex = %v/%v", pms[1].Lng, pms[1].Lat)
	}
}

func TestValidCategory(t *testing.T) {
	if !ValidCategory("venue") || !ValidCategory("parking") {
		t.Fatal("expected valid categories")
	}
	if ValidCategory("airport") || ValidCategory("") {
		t.Fatal("expected invalid categories")
	}
}
