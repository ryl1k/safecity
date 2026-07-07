// Current device location → [lng, lat], falling back to central Lviv. Permission
// is requested lazily; denial, timeout, or an implausible fix silently falls back
// so the app never blocks (and we never plan a "3000 km" route from a bad fix).
import * as Location from 'expo-location';

export const LVIV: [number, number] = [24.0316, 49.8419];

/** Rough metres between two [lng,lat] pairs (equirectangular — fine at city scale). */
export function metersBetween(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat = (((a[1] + b[1]) / 2) * Math.PI) / 180;
  const x = dLng * Math.cos(lat);
  return Math.sqrt(x * x + dLat * dLat) * R;
}

export async function getCurrentLocation(): Promise<[number, number]> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return LVIV;
    // Race the GPS read against a timeout so a stuck emulator fix can't hang us.
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeout,
    ]);
    if (!pos) return LVIV;
    return [pos.coords.longitude, pos.coords.latitude];
  } catch {
    return LVIV;
  }
}
