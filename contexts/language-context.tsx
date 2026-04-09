'use client'

import React, { createContext, useContext, useState } from 'react'
import { dictionary, Locale } from '@/lib/dictionary'

type LanguageContextType = {
  lang: Locale
  toggleLanguage: () => void
  t: typeof dictionary.en
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

function getInitialLang(): Locale {
  if (typeof window === 'undefined') return 'en'
  return (localStorage.getItem('app-language') as Locale) || 'en'
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Locale>(getInitialLang)

  const toggleLanguage = () => {
    const newLang = lang === 'en' ? 'th' : 'en'
    setLang(newLang)
    localStorage.setItem('app-language', newLang)
  }

  return (
    <LanguageContext.Provider value={{ lang, toggleLanguage, t: dictionary[lang] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
