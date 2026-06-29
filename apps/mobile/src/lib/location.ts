// Current device location → [lng, lat], falling back to central Lviv. Permission
// is requested lazily; denial or timeout silently falls back so the app never blocks.
import * as Location from 'expo-location';

export const LVIV: [number, number] = [24.0316, 49.8419];

export async function getCurrentLocation(): Promise<[number, number]> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return LVIV;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return [pos.coords.longitude, pos.coords.latitude];
  } catch {
    return LVIV;
  }
}
