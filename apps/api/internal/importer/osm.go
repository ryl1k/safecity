package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DefaultBBox is central Lviv (S,W,N,E).
const DefaultBBox = "49.80,23.98,49.86,24.06"

// DefaultOverpassURL is the public Overpass endpoint.
const DefaultOverpassURL = "https://overpass-api.de/api/interpreter"

// OSMElement is one Overpass element.
type OSMElement struct {
	Type   string   `json:"type"`
	ID     int64    `json:"id"`
	Lat    *float64 `json:"lat"`
	Lon    *float64 `json:"lon"`
	Center *struct {
		Lat float64 `json:"lat"`
		Lon float64 `json:"lon"`
	} `json:"center"`
	Tags map[string]string `json:"tags"`
}

func overpassQuery(bbox string) string {
	return fmt.Sprintf(`[out:json][timeout:90];
(
  node["amenity"="toilets"](%[1]s);
  way["amenity"="toilets"](%[1]s);
  node["railway"="tram_stop"](%[1]s);
  node["highway"="bus_stop"](%[1]s);
  node["highway"="crossing"](%[1]s);
  node["amenity"="parking"]["capacity:disabled"](%[1]s);
  way["amenity"="parking"]["capacity:disabled"](%[1]s);
  node["wheelchair"](%[1]s);
  way["wheelchair"](%[1]s);
);
out center 800;`, bbox)
}

// tri maps an OSM tri-state accessibility value to yes/no/"".
func tri(v string) string {
	switch v {
	case "yes":
		return "yes"
	case "no", "limited":
		return "no"
	default:
		return ""
	}
}

// bin maps a binary OSM value to yes/no/"".
func bin(v string) string {
	switch v {
	case "yes":
		return "yes"
	case "no":
		return "no"
	default:
		return ""
	}
}

func categorize(t map[string]string) string {
	switch {
	case t["amenity"] == "toilets":
		return "toilet"
	case t["railway"] == "tram_stop" || t["highway"] == "bus_stop" || t["public_transport"] != "":
		return "transit"
	case t["highway"] == "crossing" || t["footway"] == "crossing":
		return "crossing"
	case t["amenity"] == "parking":
		return "parking"
	default:
		return "venue"
	}
}

func featuresFor(cat string, t map[string]string) map[string]string {
	f := map[string]string{}
	wc := tri(t["wheelchair"])
	tp := bin(t["tactile_paving"])
	switch cat {
	case "venue":
		if wc != "" {
			f["step_free_entrance"] = wc
		}
		if v := tri(t["toilets:wheelchair"]); v != "" {
			f["accessible_toilet"] = v
		}
	case "transit":
		if wc != "" {
			f["level_boarding"] = wc
			f["step_free_to_stop"] = wc
		}
		if tp != "" {
			f["tactile_paving"] = tp
		}
	case "crossing":
		if tp != "" {
			f["tactile_paving"] = tp
		}
		switch t["kerb"] {
		case "lowered", "flush":
			f["dropped_curb"] = "yes"
		case "raised":
			f["dropped_curb"] = "no"
		}
		if t["traffic_signals:sound"] == "yes" || t["traffic_signals:vibration"] == "yes" {
			f["acoustic_signal"] = "yes"
		}
	case "toilet":
		if wc != "" {
			f["accessible_stall"] = wc
		}
	case "parking":
		if cap := t["capacity:disabled"]; cap != "" && cap != "0" && cap != "no" {
			f["disabled_bay"] = "yes"
		}
		if wc != "" {
			f["disabled_bay"] = wc
		}
	}
	return f
}

var defaultName = map[string]string{
	"toilet":   "Громадський туалет",
	"transit":  "Зупинка громадського транспорту",
	"crossing": "Пішохідний перехід",
	"parking":  "Паркування для людей з інвалідністю",
}

func nameFor(cat string, t map[string]string) string {
	if t["name"] != "" {
		return t["name"]
	}
	if cat == "transit" && t["railway"] == "tram_stop" {
		return "Зупинка трамвая"
	}
	return defaultName[cat] // venue with no name → "" → skip
}

func addressFor(t map[string]string) string {
	street := t["addr:street"]
	hn := t["addr:housenumber"]
	if street != "" && hn != "" {
		return street + ", " + hn
	}
	return street
}

// mapElement converts an Overpass element to a PointRecord + feature values.
// ok is false when the element lacks coordinates or a usable name (skip it).
func mapElement(el OSMElement) (PointRecord, map[string]string, bool) {
	t := el.Tags
	if t == nil {
		t = map[string]string{}
	}
	var lat, lng float64
	switch {
	case el.Lat != nil && el.Lon != nil:
		lat, lng = *el.Lat, *el.Lon
	case el.Center != nil:
		lat, lng = el.Center.Lat, el.Center.Lon
	default:
		return PointRecord{}, nil, false
	}
	cat := categorize(t)
	name := nameFor(cat, t)
	if name == "" {
		return PointRecord{}, nil, false
	}
	rec := PointRecord{
		Name:         name,
		Category:     cat,
		Lng:          lng,
		Lat:          lat,
		Address:      strptr(addressFor(t)),
		VerifyStatus: "verified",
		OSMID:        fmt.Sprintf("%s/%d", el.Type, el.ID),
	}
	return rec, featuresFor(cat, t), true
}

// ImportOSM queries Overpass for accessibility features in bbox and upserts them.
func ImportOSM(ctx context.Context, pool *pgxpool.Pool, client *http.Client, endpoint, bbox string) (Stats, error) {
	if endpoint == "" {
		endpoint = DefaultOverpassURL
	}
	if bbox == "" {
		bbox = DefaultBBox
	}
	elements, err := fetchOverpass(ctx, client, endpoint, bbox)
	if err != nil {
		return Stats{}, err
	}

	var st Stats
	for _, el := range elements {
		rec, feats, ok := mapElement(el)
		if !ok {
			st.Skipped++
			continue
		}
		id, err := upsertPoint(ctx, pool, rec)
		if err != nil {
			return st, fmt.Errorf("upsert %s: %w", rec.OSMID, err)
		}
		st.Upserts++
		for k, v := range feats {
			if err := upsertFeature(ctx, pool, id, k, v); err != nil {
				return st, fmt.Errorf("upsert feature %s/%s: %w", rec.OSMID, k, err)
			}
			st.Features++
		}
	}
	return st, nil
}

func fetchOverpass(ctx context.Context, client *http.Client, endpoint, bbox string) ([]OSMElement, error) {
	body := "data=" + url.QueryEscape(overpassQuery(bbox))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", userAgent)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("overpass request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return nil, fmt.Errorf("overpass %d: %s", resp.StatusCode, snippet)
	}
	var payload struct {
		Elements []OSMElement `json:"elements"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode overpass: %w", err)
	}
	return payload.Elements, nil
}
