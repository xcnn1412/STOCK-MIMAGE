export type Locale = 'th' | 'en'

export const defaultLocale: Locale = 'th'
export const locales: Locale[] = ['th', 'en']

export const LOCALE_STORAGE_KEY = 'kpi-locale'

export const localeNames: Record<Locale, string> = {
  th: 'ไทย',
  en: 'English',
}
