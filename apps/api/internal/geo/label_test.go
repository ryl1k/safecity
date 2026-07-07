package geo

import "testing"

func TestTrimLabel(t *testing.T) {
	cases := map[string]string{
		"вулиця Личаківська, 45, Личаків, Львів, Львівська область, 79000, Україна": "вулиця Личаківська, 45, Личаків",
		"Львів, Львівська міська громада, Львівський район, Україна":                "Львів",
		"79000, Україна": "79000, Україна", // nothing meaningful left → original
	}
	for in, want := range cases {
		if got := trimLabel(in); got != want {
			t.Errorf("trimLabel(%q) = %q, want %q", in, got, want)
		}
	}
}
