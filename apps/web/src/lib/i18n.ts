// Minimal i18n scaffold — UA primary, EN secondary. Full next-intl routing is a follow-up;
// for now this provides a typed dictionary so copy lives in one place.

export type Locale = 'uk' | 'en';
export const defaultLocale: Locale = 'uk';

export const messages = {
  uk: {
    appName: 'SafeCity',
    tagline: 'Інклюзивна мапа Львова',
    openMap: 'Відкрити мапу',
    startOnboarding: 'Налаштувати під себе',
  },
  en: {
    appName: 'SafeCity',
    tagline: 'Inclusive map of Lviv',
    openMap: 'Open the map',
    startOnboarding: 'Set up for me',
  },
} as const;

export type MessageKey = keyof (typeof messages)['uk'];

export function t(key: MessageKey, locale: Locale = defaultLocale): string {
  return messages[locale][key];
}
