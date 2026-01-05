'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { dictionary, Locale } from '@/lib/dictionary'

type LanguageContextType = {
  lang: Locale
  toggleLanguage: () => void
  t: typeof dictionary.en
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Locale>('en')

  useEffect(() => {
    const savedLang = localStorage.getItem('app-language') as Locale
    if (savedLang) {
      setLang(savedLang)
    }
  }, [])

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
