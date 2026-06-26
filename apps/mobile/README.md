# @safecity/mobile

React Native via **Expo + dev client** (config plugins for vision-camera, MapLibre, ML Kit).

```
app/                 expo-router routes:
                       (onboarding)/ · (tabs)/ · point/[id] · problem/[id]
                       petition/[id] · route/ · walk/ (CV mode) · auth/
src/
  features/          onboarding, map, points, routing, cv-tts, civic, account
  components/        platform UI (consumes @safecity/design-tokens)
  theme/             profile-aware theming — the UI-mode swap engine lives here
  lib/               supabase, api-client, i18n, tts, haptics, permissions
  state/             stores: accessibilityProfile, filters
app.config.ts        Expo config + native plugins
eas.json             build profiles
```

The **onboarding spine** drives theme + which features are offered. Accessible by default
(bootstrap rule). KB: `03 · Onboarding`, `02 · Map`, `06 · CV + TTS`, `11 · A11y`.
