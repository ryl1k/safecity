import type { ExpoConfig } from 'expo/config';

// SafeCity mobile (Expo + dev client). Native modules (MapLibre, later
// vision-camera/ML Kit) require a dev client / prebuild — not Expo Go.
const LOCATION_USAGE = 'SafeCity uses your location to show accessible places near you.';
const PHOTOS_USAGE = 'SafeCity uses your photos so you can attach images to places and reported barriers.';

const config: ExpoConfig = {
  name: 'SafeCity',
  slug: 'safecity',
  scheme: 'safecity',
  version: '0.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.safecity.mobile',
    infoPlist: {
      NSLocationWhenInUseUsageDescription: LOCATION_USAGE,
      NSPhotoLibraryUsageDescription: PHOTOS_USAGE,
    },
  },
  android: {
    package: 'app.safecity.mobile',
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    ['expo-location', { locationWhenInUsePermission: LOCATION_USAGE }],
    ['expo-image-picker', { photosPermission: PHOTOS_USAGE }],
  ],
};

export default config;
