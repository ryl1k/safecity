// City registry for the nationwide map: the 75 most-populated
// government-controlled cities with monitored accessibility objects.
// Centres are derived from the objects themselves (dataset centroids);
// generated together with the importer's showcase list.
export interface City {
  id: string;
  name: string;
  oblast: string;
  lng: number;
  lat: number;
}

export const CITIES: City[] = [
  { id: "kyiv", name: "Київ", oblast: "м. Київ", lng: 30.4900, lat: 50.4415 },
  { id: "kharkiv", name: "Харків", oblast: "Харківська", lng: 36.2697, lat: 49.9836 },
  { id: "odesa", name: "Одеса", oblast: "Одеська", lng: 30.7415, lat: 46.4863 },
  { id: "dnipro", name: "Дніпро", oblast: "Дніпропетровська", lng: 35.0298, lat: 48.4604 },
  { id: "lviv", name: "Львів", oblast: "Львівська", lng: 24.0250, lat: 49.8389 },
  { id: "zaporizhzhia", name: "Запоріжжя", oblast: "Запорізька", lng: 35.1215, lat: 47.8474 },
  { id: "kryvyi-rih", name: "Кривий Ріг", oblast: "Дніпропетровська", lng: 33.3998, lat: 47.9170 },
  { id: "mykolaiv", name: "Миколаїв", oblast: "Миколаївська", lng: 32.0052, lat: 46.9539 },
  { id: "vinnytsia", name: "Вінниця", oblast: "Вінницька", lng: 28.4661, lat: 49.2386 },
  { id: "kherson", name: "Херсон", oblast: "Херсонська", lng: 32.6081, lat: 46.6542 },
  { id: "chernihiv", name: "Чернігів", oblast: "Чернігівська", lng: 31.2932, lat: 51.5064 },
  { id: "poltava", name: "Полтава", oblast: "Полтавська", lng: 34.5422, lat: 49.5865 },
  { id: "khmelnytskyi", name: "Хмельницький", oblast: "Хмельницька", lng: 26.9962, lat: 49.4206 },
  { id: "cherkasy", name: "Черкаси", oblast: "Черкаська", lng: 32.0700, lat: 49.4388 },
  { id: "chernivtsi", name: "Чернівці", oblast: "Чернівецька", lng: 25.9430, lat: 48.2907 },
  { id: "zhytomyr", name: "Житомир", oblast: "Житомирська", lng: 28.6716, lat: 50.2566 },
  { id: "sumy", name: "Суми", oblast: "Сумська", lng: 34.8042, lat: 50.9081 },
  { id: "rivne", name: "Рівне", oblast: "Рівненська", lng: 26.2536, lat: 50.6254 },
  { id: "ivano-frankivsk", name: "Івано-Франківськ", oblast: "Івано-Франківська", lng: 24.7117, lat: 48.9193 },
  { id: "kamianske", name: "Кам'янське", oblast: "Дніпропетровська", lng: 34.5988, lat: 48.5112 },
  { id: "kropyvnytskyi", name: "Кропивницький", oblast: "Кіровоградська", lng: 32.2538, lat: 48.5075 },
  { id: "ternopil", name: "Тернопіль", oblast: "Тернопільська", lng: 25.5883, lat: 49.5511 },
  { id: "kremenchuk", name: "Кременчук", oblast: "Полтавська", lng: 33.4323, lat: 49.0832 },
  { id: "lutsk", name: "Луцьк", oblast: "Волинська", lng: 25.3383, lat: 50.7484 },
  { id: "bila-tserkva", name: "Біла Церква", oblast: "Київська", lng: 30.1169, lat: 49.7977 },
  { id: "kramatorsk", name: "Краматорськ", oblast: "Донецька", lng: 37.5842, lat: 48.7342 },
  { id: "uzhhorod", name: "Ужгород", oblast: "Закарпатська", lng: 22.2916, lat: 48.6198 },
  { id: "brovary", name: "Бровари", oblast: "Київська", lng: 30.7974, lat: 50.5111 },
  { id: "nikopol", name: "Нікополь", oblast: "Дніпропетровська", lng: 34.3792, lat: 47.5784 },
  { id: "sloviansk", name: "Слов'янськ", oblast: "Донецька", lng: 37.6035, lat: 48.8437 },
  { id: "pavlohrad", name: "Павлоград", oblast: "Дніпропетровська", lng: 35.8834, lat: 48.5243 },
  { id: "kamianets-podilskyi", name: "Кам'янець-Подільський", oblast: "Хмельницька", lng: 26.5858, lat: 48.6843 },
  { id: "konotop", name: "Конотоп", oblast: "Сумська", lng: 33.2027, lat: 51.2404 },
  { id: "uman", name: "Умань", oblast: "Черкаська", lng: 30.2187, lat: 48.7504 },
  { id: "berdychiv", name: "Бердичів", oblast: "Житомирська", lng: 28.5941, lat: 49.8958 },
  { id: "mukachevo", name: "Мукачево", oblast: "Закарпатська", lng: 22.7208, lat: 48.4397 },
  { id: "oleksandriia", name: "Олександрія", oblast: "Кіровоградська", lng: 33.1210, lat: 48.6681 },
  { id: "shostka", name: "Шостка", oblast: "Сумська", lng: 33.4851, lat: 51.8658 },
  { id: "izmail", name: "Ізмаїл", oblast: "Одеська", lng: 28.8371, lat: 45.3476 },
  { id: "drohobych", name: "Дрогобич", oblast: "Львівська", lng: 23.5060, lat: 49.3539 },
  { id: "nizhyn", name: "Ніжин", oblast: "Чернігівська", lng: 31.8854, lat: 51.0435 },
  { id: "samar", name: "Самар", oblast: "Дніпропетровська", lng: 35.2283, lat: 48.6312 },
  { id: "irpin", name: "Ірпінь", oblast: "Київська", lng: 30.2378, lat: 50.5186 },
  { id: "sheptytskyi", name: "Шептицький", oblast: "Львівська", lng: 24.2422, lat: 50.3958 },
  { id: "kalush", name: "Калуш", oblast: "Івано-Франківська", lng: 24.3785, lat: 49.0260 },
  { id: "kolomyia", name: "Коломия", oblast: "Івано-Франківська", lng: 25.0487, lat: 48.5355 },
  { id: "stryi", name: "Стрий", oblast: "Львівська", lng: 23.8519, lat: 49.2594 },
  { id: "kovel", name: "Ковель", oblast: "Волинська", lng: 24.7050, lat: 51.2142 },
  { id: "smila", name: "Сміла", oblast: "Черкаська", lng: 31.8803, lat: 49.2212 },
  { id: "volodymyr", name: "Володимир", oblast: "Волинська", lng: 24.3203, lat: 50.8487 },
  { id: "chornomorsk", name: "Чорноморськ", oblast: "Одеська", lng: 30.6542, lat: 46.3011 },
  { id: "lozova", name: "Лозова", oblast: "Харківська", lng: 36.3109, lat: 48.8867 },
  { id: "zviahel", name: "Звягель", oblast: "Житомирська", lng: 27.6135, lat: 50.5904 },
  { id: "fastiv", name: "Фастів", oblast: "Київська", lng: 29.9157, lat: 50.0782 },
  { id: "korosten", name: "Коростень", oblast: "Житомирська", lng: 28.6316, lat: 50.9554 },
  { id: "myrhorod", name: "Миргород", oblast: "Полтавська", lng: 33.6096, lat: 49.9671 },
  { id: "vyshneve", name: "Вишневе", oblast: "Київська", lng: 30.3731, lat: 50.3878 },
  { id: "obukhiv", name: "Обухів", oblast: "Київська", lng: 30.6414, lat: 50.1227 },
  { id: "bucha", name: "Буча", oblast: "Київська", lng: 30.2122, lat: 50.5511 },
  { id: "vasylkiv", name: "Васильків", oblast: "Київська", lng: 30.3187, lat: 50.1795 },
  { id: "bilhorod-dnistrovskyi", name: "Білгород-Дністровський", oblast: "Одеська", lng: 30.3416, lat: 46.1863 },
  { id: "boryspil", name: "Бориспіль", oblast: "Київська", lng: 30.9417, lat: 50.3594 },
  { id: "pervomaisk", name: "Первомайськ", oblast: "Миколаївська", lng: 30.8486, lat: 48.0361 },
  { id: "okhtyrka", name: "Охтирка", oblast: "Сумська", lng: 34.9032, lat: 50.3119 },
  { id: "romny", name: "Ромни", oblast: "Сумська", lng: 33.4876, lat: 50.7505 },
  { id: "pryluky", name: "Прилуки", oblast: "Чернігівська", lng: 32.3821, lat: 50.5900 },
  { id: "lubny", name: "Лубни", oblast: "Полтавська", lng: 32.9965, lat: 50.0141 },
  { id: "horishni-plavni", name: "Горішні Плавні", oblast: "Полтавська", lng: 33.6344, lat: 49.0101 },
  { id: "novovolynsk", name: "Нововолинськ", oblast: "Волинська", lng: 24.1652, lat: 50.7285 },
  { id: "vynohradiv", name: "Виноградів", oblast: "Закарпатська", lng: 23.0345, lat: 48.1416 },
  { id: "truskavets", name: "Трускавець", oblast: "Львівська", lng: 23.5068, lat: 49.2817 },
  { id: "boryslav", name: "Борислав", oblast: "Львівська", lng: 23.4255, lat: 49.2876 },
  { id: "novoiavorivsk", name: "Новояворівськ", oblast: "Львівська", lng: 23.5696, lat: 49.9332 },
  { id: "podilsk", name: "Подільськ", oblast: "Одеська", lng: 29.5322, lat: 47.7488 },
  { id: "voznesensk", name: "Вознесенськ", oblast: "Миколаївська", lng: 31.3290, lat: 47.5758 },
];

export const DEFAULT_CITY_ID = 'lviv';
const KEY = 'sc-city';

export function cityById(id: string | null | undefined): City {
  return CITIES.find((c) => c.id === id) ?? CITIES.find((c) => c.id === DEFAULT_CITY_ID) ?? CITIES[0]!;
}

/** City bbox for the initial point load (~city-scale; the map's pan-refetch
 *  covers anything beyond it). */
export function cityBbox(c: City): { minLng: number; minLat: number; maxLng: number; maxLat: number } {
  const dLng = 0.18;
  const dLat = 0.12;
  return { minLng: c.lng - dLng, minLat: c.lat - dLat, maxLng: c.lng + dLng, maxLat: c.lat + dLat };
}

export function nearestCity(lng: number, lat: number): City {
  let best = CITIES[0]!;
  let bestD = Infinity;
  for (const c of CITIES) {
    const d = (c.lng - lng) ** 2 + (c.lat - lat) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export function loadCity(): City {
  try {
    return cityById(localStorage.getItem(KEY));
  } catch {
    return cityById(DEFAULT_CITY_ID);
  }
}

export function saveCity(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode etc. */
  }
}
