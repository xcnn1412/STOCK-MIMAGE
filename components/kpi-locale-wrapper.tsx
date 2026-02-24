'use client'

import { LocaleProvider } from '@/lib/i18n/context'

export default function KpiLocaleWrapper({ children }: { children: React.ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>
}
