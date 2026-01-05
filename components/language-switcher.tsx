'use client'

import { Button } from "@/components/ui/button"
import { useLanguage } from "@/contexts/language-context"

export function LanguageSwitcher() {
  const { lang, toggleLanguage } = useLanguage()

  return (
    <Button 
        variant="ghost" 
        size="sm" 
        onClick={toggleLanguage}
        className="font-semibold w-12"
    >
      {lang === 'en' ? 'TH' : 'EN'}
    </Button>
  )
}
