package importer

import "fmt"

// City is a seed city for the nationwide sidewalk import. This is the same
// 75 government-controlled cities used for the points showcase — kept in sync
// by hand with apps/web/src/lib/cities.ts (id/name/lng/lat must match).
type City struct {
	ID   string
	Name string
	Lng  float64
	Lat  float64
}

// Cities are the 75 most-populated government-controlled cities, in the same
// order as apps/web/src/lib/cities.ts.
var Cities = []City{
	{"kyiv", "Київ", 30.4900, 50.4415},
	{"kharkiv", "Харків", 36.2697, 49.9836},
	{"odesa", "Одеса", 30.7415, 46.4863},
	{"dnipro", "Дніпро", 35.0298, 48.4604},
	{"lviv", "Львів", 24.0250, 49.8389},
	{"zaporizhzhia", "Запоріжжя", 35.1215, 47.8474},
	{"kryvyi-rih", "Кривий Ріг", 33.3998, 47.9170},
	{"mykolaiv", "Миколаїв", 32.0052, 46.9539},
	{"vinnytsia", "Вінниця", 28.4661, 49.2386},
	{"kherson", "Херсон", 32.6081, 46.6542},
	{"chernihiv", "Чернігів", 31.2932, 51.5064},
	{"poltava", "Полтава", 34.5422, 49.5865},
	{"khmelnytskyi", "Хмельницький", 26.9962, 49.4206},
	{"cherkasy", "Черкаси", 32.0700, 49.4388},
	{"chernivtsi", "Чернівці", 25.9430, 48.2907},
	{"zhytomyr", "Житомир", 28.6716, 50.2566},
	{"sumy", "Суми", 34.8042, 50.9081},
	{"rivne", "Рівне", 26.2536, 50.6254},
	{"ivano-frankivsk", "Івано-Франківськ", 24.7117, 48.9193},
	{"kamianske", "Кам'янське", 34.5988, 48.5112},
	{"kropyvnytskyi", "Кропивницький", 32.2538, 48.5075},
	{"ternopil", "Тернопіль", 25.5883, 49.5511},
	{"kremenchuk", "Кременчук", 33.4323, 49.0832},
	{"lutsk", "Луцьк", 25.3383, 50.7484},
	{"bila-tserkva", "Біла Церква", 30.1169, 49.7977},
	{"kramatorsk", "Краматорськ", 37.5842, 48.7342},
	{"uzhhorod", "Ужгород", 22.2916, 48.6198},
	{"brovary", "Бровари", 30.7974, 50.5111},
	{"nikopol", "Нікополь", 34.3792, 47.5784},
	{"sloviansk", "Слов'янськ", 37.6035, 48.8437},
	{"pavlohrad", "Павлоград", 35.8834, 48.5243},
	{"kamianets-podilskyi", "Кам'янець-Подільський", 26.5858, 48.6843},
	{"konotop", "Конотоп", 33.2027, 51.2404},
	{"uman", "Умань", 30.2187, 48.7504},
	{"berdychiv", "Бердичів", 28.5941, 49.8958},
	{"mukachevo", "Мукачево", 22.7208, 48.4397},
	{"oleksandriia", "Олександрія", 33.1210, 48.6681},
	{"shostka", "Шостка", 33.4851, 51.8658},
	{"izmail", "Ізмаїл", 28.8371, 45.3476},
	{"drohobych", "Дрогобич", 23.5060, 49.3539},
	{"nizhyn", "Ніжин", 31.8854, 51.0435},
	{"samar", "Самар", 35.2283, 48.6312},
	{"irpin", "Ірпінь", 30.2378, 50.5186},
	{"sheptytskyi", "Шептицький", 24.2422, 50.3958},
	{"kalush", "Калуш", 24.3785, 49.0260},
	{"kolomyia", "Коломия", 25.0487, 48.5355},
	{"stryi", "Стрий", 23.8519, 49.2594},
	{"kovel", "Ковель", 24.7050, 51.2142},
	{"smila", "Сміла", 31.8803, 49.2212},
	{"volodymyr", "Володимир", 24.3203, 50.8487},
	{"chornomorsk", "Чорноморськ", 30.6542, 46.3011},
	{"lozova", "Лозова", 36.3109, 48.8867},
	{"zviahel", "Звягель", 27.6135, 50.5904},
	{"fastiv", "Фастів", 29.9157, 50.0782},
	{"korosten", "Коростень", 28.6316, 50.9554},
	{"myrhorod", "Миргород", 33.6096, 49.9671},
	{"vyshneve", "Вишневе", 30.3731, 50.3878},
	{"obukhiv", "Обухів", 30.6414, 50.1227},
	{"bucha", "Буча", 30.2122, 50.5511},
	{"vasylkiv", "Васильків", 30.3187, 50.1795},
	{"bilhorod-dnistrovskyi", "Білгород-Дністровський", 30.3416, 46.1863},
	{"boryspil", "Бориспіль", 30.9417, 50.3594},
	{"pervomaisk", "Первомайськ", 30.8486, 48.0361},
	{"okhtyrka", "Охтирка", 34.9032, 50.3119},
	{"romny", "Ромни", 33.4876, 50.7505},
	{"pryluky", "Прилуки", 32.3821, 50.5900},
	{"lubny", "Лубни", 32.9965, 50.0141},
	{"horishni-plavni", "Горішні Плавні", 33.6344, 49.0101},
	{"novovolynsk", "Нововолинськ", 24.1652, 50.7285},
	{"vynohradiv", "Виноградів", 23.0345, 48.1416},
	{"truskavets", "Трускавець", 23.5068, 49.2817},
	{"boryslav", "Борислав", 23.4255, 49.2876},
	{"novoiavorivsk", "Новояворівськ", 23.5696, 49.9332},
	{"podilsk", "Подільськ", 29.5322, 47.7488},
	{"voznesensk", "Вознесенськ", 31.3290, 47.5758},
}

// cityBBoxPad matches apps/web/src/lib/cities.ts's cityBbox() padding exactly
// (±0.18° lng, ±0.12° lat around the city centroid).
const (
	cityBBoxPadLng = 0.18
	cityBBoxPadLat = 0.12
)

// CityBBox renders a city's bbox in Overpass's "south,west,north,east" order
// (matching DefaultBBox's format), padded the same way as the web's cityBbox().
func CityBBox(c City) string {
	south := c.Lat - cityBBoxPadLat
	north := c.Lat + cityBBoxPadLat
	west := c.Lng - cityBBoxPadLng
	east := c.Lng + cityBBoxPadLng
	return fmt.Sprintf("%.4f,%.4f,%.4f,%.4f", south, west, north, east)
}
