import type { ExpoConfig } from 'expo/config';

// SafeCity mobile (Expo + dev client). Native modules (MapLibre, later
// vision-camera/ML Kit) require a dev client / prebuild — not Expo Go.
const LOCATION_USAGE = 'SafeCity uses your location to show accessible places near you.';

const config: ExpoConfig = {
  name: 'SafeCity',
  slug: 'safecity',
  scheme: 'safecity',
  version: '0.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.safecity.mobile',
    infoPlist: {
      NSLocationWhenInUseUsageDescription: LOCATION_USAGE,
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
  ],
};

export default config;
