'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { dictionary, Locale } from '@/lib/dictionary'

type LanguageContextType = {
  lang: Locale
  toggleLanguage: () => void
  t: typeof dictionary.en
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // server กับ client ต้องเริ่มที่ค่าเดียวกัน ('en') — ถ้าอ่าน localStorage ตอน init
  // จะ hydration mismatch แล้ว React ทิ้ง DOM ทั้งหน้า (พังเป็น $RS parentNode null)
  const [lang, setLang] = useState<Locale>('en')
  /* eslint-disable react-hooks/set-state-in-effect -- อ่านค่าที่บันทึกไว้หลัง mount (แบบเดียวกับ sidebar) */
  useEffect(() => {
    const saved = localStorage.getItem('app-language') as Locale | null
    if (saved && saved !== 'en') setLang(saved)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

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
