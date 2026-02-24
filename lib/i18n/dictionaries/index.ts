import th from './th'
import en from './en'
import type { Locale } from '../index'
import type { Dictionary } from './th'

const dictionaries: Record<Locale, Dictionary> = { th, en }

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale]
}

export type { Dictionary }
