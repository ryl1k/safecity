package transit

// lvivRouteAccess is the full per-route accessibility table for Lviv, keyed by
// the GTFS route_short_name. Derived from eway.in.ua/ua/cities/lviv/routes
// (2026-07-02): категорії «Автобус» і «Тролейбус» = низькопідлогові
// (accessible), «Трамвай» і «Маршрутка» = ні. An explicit per-trip ACCESSIBLE
// flag from the city's GTFS still upgrades a trip to yes (e.g. the new
// low-floor trams on Т08) — see accessOf.
var lvivRouteAccess = map[string]Access{
	// Автобуси (низькопідлогові)
	"А01": AccessYes, "А03": AccessYes, "А05": AccessYes, "А06": AccessYes,
	"А08а": AccessYes, "А09": AccessYes, "А10": AccessYes, "А11": AccessYes,
	"А16": AccessYes, "А18": AccessYes, "А19": AccessYes, "А20": AccessYes,
	"А23": AccessYes, "А29": AccessYes, "А32": AccessYes, "А37": AccessYes,
	"А40": AccessYes, "А46": AccessYes, "А47": AccessYes, "А48": AccessYes,
	"А49": AccessYes, "А51": AccessYes, "А52": AccessYes, "А53": AccessYes,
	"А55": AccessYes, "А56": AccessYes, "А60": AccessYes, "А61": AccessYes,
	"А80": AccessYes, "А84": AccessYes, "А92": AccessYes, "А99": AccessYes,
	// Тролейбуси (низькопідлогові)
	"Тр22": AccessYes, "Тр23": AccessYes, "Тр24": AccessYes, "Тр25": AccessYes,
	"Тр27": AccessYes, "Тр30": AccessYes, "Тр31": AccessYes, "Тр32": AccessYes,
	"Тр38": AccessYes,
	// Трамваї
	"Т01": AccessNo, "Т02": AccessNo, "Т03": AccessNo, "Т04": AccessNo,
	"Т06": AccessNo, "Т07": AccessNo, "Т08": AccessNo, "Т09": AccessNo,
	// Маршрутки
	"А07": AccessNo, "А12": AccessNo, "А14": AccessNo, "А15": AccessNo,
	"А17": AccessNo, "А21": AccessNo, "А22": AccessNo, "А25": AccessNo,
	"А27": AccessNo, "А31": AccessNo, "А33": AccessNo, "А34": AccessNo,
	"А39": AccessNo, "А39а": AccessNo, "А41": AccessNo, "А43": AccessNo,
	"А45": AccessNo, "А57": AccessNo, "А58": AccessNo, "А59": AccessNo,
	"А62": AccessNo, "А63": AccessNo,
}
