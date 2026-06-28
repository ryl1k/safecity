# @safecity/mobile

React Native via **Expo SDK 52 + dev client** (native modules → **not Expo Go**).
expo-router, MapLibre RN, Supabase (AsyncStorage). Reuses `@safecity/shared`
(types + `computeRating`) and `@safecity/design-tokens`.

```
app/                 expo-router routes
  _layout.tsx          root stack (gesture handler + safe area)
  index.tsx            → redirect to /places
  (tabs)/              Мапа (map) · Місця (places list)
src/
  lib/               env, supabase(AsyncStorage), api (Go API client), points, catalog, format
  components/        PointsMap (MapLibre), PointRow, RatingBadge, Centered
  theme/             theme.ts (token palette + RN scales; full provider TBD)
app.config.ts        Expo config + plugins (expo-router, dev-client, expo-location)
metro.config.js      monorepo (watch workspace root, resolve @safecity/*)
eas.json             dev/preview/production build profiles
```

## Run (needs a dev client — not Expo Go)
```
cp .env.example .env        # set EXPO_PUBLIC_API_URL (LAN IP, not localhost) + Supabase
pnpm --filter @safecity/mobile exec expo run:android   # or run:ios — builds the dev client
pnpm --filter @safecity/mobile start                   # then start Metro
```
The map + nearby list read from the Go API (`EXPO_PUBLIC_API_URL`); unset → Supabase-direct.

## Status
Scaffold + shared-lib port + **map + nearby-list** (reads the Go API; ratings via
`computeRating`). Type-checks; runtime verified on device/emulator only.
**Next:** theme/profile providers (AsyncStorage) → onboarding spine → point detail →
civic → routing → CV walk mode (vision-camera + ML Kit, blind profile, disclaimer).

KB: `15 · Mobile Build Plan`, `10 · Architecture`, `02 · Map`, `03 · Onboarding`, `06 · CV+TTS`, `11 · A11y`.
