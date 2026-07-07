package importer

import (
	"testing"
	"time"
)

func TestNormalizeAndJaccard(t *testing.T) {
	if got := normalizeName(`«Кафе»  "Львів".`); got != "кафе львів" {
		t.Fatalf("normalize = %q", got)
	}
	if j := jaccard("Кафе Львів", "кафе львів"); j != 1 {
		t.Fatalf("identical jaccard = %v, want 1", j)
	}
	if j := jaccard("Кафе Львів", "Кафе Київ"); j <= 0 || j >= 1 {
		t.Fatalf("partial jaccard = %v, want in (0,1)", j)
	}
	if j := jaccard("", "x"); j != 0 {
		t.Fatalf("empty jaccard = %v", j)
	}
}

func TestMetersBetween(t *testing.T) {
	// ~0.0002° of latitude ≈ 22 m.
	d := metersBetween(49.8400, 24.0, 49.8402, 24.0)
	if d < 18 || d > 26 {
		t.Fatalf("distance = %.1f m, want ~22", d)
	}
}

func TestClusterDuplicatesMerges(t *testing.T) {
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	rows := []DedupeRow{
		// two near + similar names, same category → merge; richer one survives.
		{ID: "a", Name: "Кафе Львів", Category: "venue", Lng: 24.0, Lat: 49.8400, NFeatures: 1, VerifyStatus: "unverified", CreatedAt: base},
		{ID: "b", Name: "кафе львів", Category: "venue", Lng: 24.0, Lat: 49.8401, NFeatures: 5, VerifyStatus: "verified", CreatedAt: base.Add(time.Hour)},
		// far away → no merge.
		{ID: "c", Name: "Кафе Львів", Category: "venue", Lng: 24.10, Lat: 49.90, CreatedAt: base},
		// same spot+name but different category → no merge.
		{ID: "d", Name: "Кафе Львів", Category: "toilet", Lng: 24.0, Lat: 49.8400, CreatedAt: base},
	}
	merges := clusterDuplicates(rows, DefaultRadiusM, DefaultNameSim)
	if len(merges) != 1 {
		t.Fatalf("got %d merges, want 1: %+v", len(merges), merges)
	}
	m := merges[0]
	if m.Survivor.ID != "b" { // more features + verified → higher score
		t.Fatalf("survivor = %s, want b", m.Survivor.ID)
	}
	if len(m.Dups) != 1 || m.Dups[0].ID != "a" {
		t.Fatalf("dups = %+v, want [a]", m.Dups)
	}
}

func TestClusterDuplicatesNoFalsePositives(t *testing.T) {
	rows := []DedupeRow{
		{ID: "a", Name: "Аптека", Category: "venue", Lng: 24.0, Lat: 49.84},
		{ID: "b", Name: "Школа", Category: "venue", Lng: 24.0, Lat: 49.8401}, // near but different name
	}
	if merges := clusterDuplicates(rows, DefaultRadiusM, DefaultNameSim); len(merges) != 0 {
		t.Fatalf("expected no merges, got %+v", merges)
	}
}

func TestMergePhotosDedupes(t *testing.T) {
	got := mergePhotos([]string{"x", "y"}, []string{"y", "z"})
	if len(got) != 3 {
		t.Fatalf("merged photos = %v, want 3 unique", got)
	}
}
