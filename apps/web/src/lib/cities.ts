// City registry for the nationwide map: oblast capitals (government-controlled)
// with Lviv as the flagship/default. Coordinates are city centres.
export interface City {
  id: string;
  name: string;
  oblast: string;
  lng: number;
  lat: number;
}

export const CITIES: City[] = [
  { id: 'lviv', name: 'Львів', oblast: 'Львівська', lng: 24.0316, lat: 49.8419 },
  { id: 'kyiv', name: 'Київ', oblast: 'м. Київ', lng: 30.5234, lat: 50.4501 },
  { id: 'lutsk', name: 'Луцьк', oblast: 'Волинська', lng: 25.3424, lat: 50.7472 },
  { id: 'rivne', name: 'Рівне', oblast: 'Рівненська', lng: 26.2516, lat: 50.6199 },
  { id: 'zhytomyr', name: 'Житомир', oblast: 'Житомирська', lng: 28.6587, lat: 50.2547 },
  { id: 'vinnytsia', name: 'Вінниця', oblast: 'Вінницька', lng: 28.4682, lat: 49.2331 },
  { id: 'khmelnytskyi', name: 'Хмельницький', oblast: 'Хмельницька', lng: 26.9871, lat: 49.4229 },
  { id: 'ternopil', name: 'Тернопіль', oblast: 'Тернопільська', lng: 25.5948, lat: 49.5535 },
  { id: 'ivano-frankivsk', name: 'Івано-Франківськ', oblast: 'Івано-Франківська', lng: 24.7111, lat: 48.9226 },
  { id: 'uzhhorod', name: 'Ужгород', oblast: 'Закарпатська', lng: 22.2879, lat: 48.6208 },
  { id: 'chernivtsi', name: 'Чернівці', oblast: 'Чернівецька', lng: 25.9403, lat: 48.2921 },
  { id: 'odesa', name: 'Одеса', oblast: 'Одеська', lng: 30.7233, lat: 46.4825 },
  { id: 'mykolaiv', name: 'Миколаїв', oblast: 'Миколаївська', lng: 31.9946, lat: 46.975 },
  { id: 'dnipro', name: 'Дніпро', oblast: 'Дніпропетровська', lng: 35.0462, lat: 48.4647 },
  { id: 'zaporizhzhia', name: 'Запоріжжя', oblast: 'Запорізька', lng: 35.1396, lat: 47.8388 },
  { id: 'poltava', name: 'Полтава', oblast: 'Полтавська', lng: 34.5514, lat: 49.5883 },
  { id: 'cherkasy', name: 'Черкаси', oblast: 'Черкаська', lng: 32.0598, lat: 49.4444 },
  { id: 'kropyvnytskyi', name: 'Кропивницький', oblast: 'Кіровоградська', lng: 32.2623, lat: 48.5079 },
  { id: 'chernihiv', name: 'Чернігів', oblast: 'Чернігівська', lng: 31.2893, lat: 51.4982 },
  { id: 'sumy', name: 'Суми', oblast: 'Сумська', lng: 34.7981, lat: 50.9077 },
  { id: 'kharkiv', name: 'Харків', oblast: 'Харківська', lng: 36.2304, lat: 49.9935 },
  { id: 'kherson', name: 'Херсон', oblast: 'Херсонська', lng: 32.6169, lat: 46.6354 },
  { id: 'kramatorsk', name: 'Краматорськ', oblast: 'Донецька', lng: 37.5555, lat: 48.7389 },
];

export const DEFAULT_CITY_ID = 'lviv';
const KEY = 'sc-city';

export function cityById(id: string | null | undefined): City {
  return CITIES.find((c) => c.id === id) ?? CITIES[0]!;
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
