package importer

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// validCategories are the point_category enum values a KML import may target.
var validCategories = map[string]bool{
	"venue": true, "transit": true, "crossing": true, "toilet": true, "parking": true,
}

// ValidCategory reports whether c is an allowed import category.
func ValidCategory(c string) bool { return validCategories[c] }

var (
	placemarkRe = regexp.MustCompile(`(?is)<Placemark\b.*?</Placemark>`)
	cdataRe     = regexp.MustCompile(`(?s)<!\[CDATA\[(.*?)\]\]>`)
)

// Placemark is one parsed KML placemark.
type Placemark struct {
	Name        string
	Description string
	Lng, Lat    float64
}

func decodeKML(s string) string {
	s = cdataRe.ReplaceAllString(s, "$1")
	r := strings.NewReplacer(
		"&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`, "&#39;", "'",
	)
	return strings.TrimSpace(r.Replace(s))
}

func pickTag(block, tag string) string {
	re := regexp.MustCompile(`(?is)<` + tag + `>(.*?)</` + tag + `>`)
	m := re.FindStringSubmatch(block)
	if m == nil {
		return ""
	}
	return decodeKML(m[1])
}

// ParsePlacemarks extracts placemarks with a name + coordinates from KML text.
// For lines/polygons it takes the first vertex (matching the original importer).
func ParsePlacemarks(xml string) []Placemark {
	var out []Placemark
	for _, block := range placemarkRe.FindAllString(xml, -1) {
		name := pickTag(block, "name")
		coordsRaw := pickTag(block, "coordinates")
		if name == "" || coordsRaw == "" {
			continue
		}
		first := strings.Fields(coordsRaw)
		if len(first) == 0 {
			continue
		}
		parts := strings.Split(first[0], ",")
		if len(parts) < 2 {
			continue
		}
		lng, err1 := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
		lat, err2 := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
		if err1 != nil || err2 != nil {
			continue
		}
		out = append(out, Placemark{
			Name:        name,
			Description: pickTag(block, "description"),
			Lng:         lng,
			Lat:         lat,
		})
	}
	return out
}

// ImportKML parses KML text and upserts placemarks as imported points of the
// given category (idempotent, keyed on a derived osm_id).
func ImportKML(ctx context.Context, pool *pgxpool.Pool, xml, category string) (Stats, error) {
	if !ValidCategory(category) {
		return Stats{}, fmt.Errorf("invalid category %q", category)
	}
	var st Stats
	for _, pm := range ParsePlacemarks(xml) {
		rec := PointRecord{
			Name:         pm.Name,
			Category:     category,
			Lng:          pm.Lng,
			Lat:          pm.Lat,
			Description:  strptr(pm.Description),
			VerifyStatus: "unverified",
			OSMID:        fmt.Sprintf("mymaps/%.5f,%.5f", pm.Lng, pm.Lat),
		}
		if _, err := upsertPoint(ctx, pool, rec); err != nil {
			return st, fmt.Errorf("upsert %s: %w", rec.OSMID, err)
		}
		st.Upserts++
	}
	return st, nil
}
