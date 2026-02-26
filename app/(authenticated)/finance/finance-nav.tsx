'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Banknote, LayoutDashboard, PlusCircle, Globe, Settings } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import type { Locale } from '@/lib/i18n'

const tabMeta = [
  { href: '/finance', key: 'claims' as const, icon: LayoutDashboard, exact: true },
  { href: '/finance/new', key: 'newClaim' as const, icon: PlusCircle, exact: false },
  { href: '/finance/settings', key: 'settings' as const, icon: Settings, exact: false },
]

const labels = {
  en: { claims: 'All Claims', newClaim: 'New Claim', settings: 'Settings' },
  th: { claims: 'ใบเบิกทั้งหมด', newClaim: 'สร้างใบเบิก', settings: 'ตั้งค่า' },
}

export default function FinanceNav({ role }: { role: string }) {
  const pathname = usePathname()
  const { locale, setLocale } = useLocale()
  const t = labels[locale] || labels.th

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        {/* Finance Brand Mark */}
        <div className="flex items-center gap-2.5 pr-4 border-r border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/25">
            <Banknote className="h-4.5 w-4.5" />
          </div>
          <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100 hidden sm:block">
            Finance
          </span>
        </div>

        {/* Tabs */}
        <nav className="flex gap-1">
          {tabMeta.map(tab => {
            const Icon = tab.icon
            const active = isActive(tab.href, tab.exact)
            const label = t[tab.key]
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`
                  relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium
                  transition-all duration-200 whitespace-nowrap
                  ${active
                    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/40'
                    : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/60'
                  }
                `}
              >
                <Icon className={`h-4 w-4 transition-colors ${active ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
                {label}
                {active && (
                  <span className="absolute -bottom-[9px] left-3 right-3 h-[2px] rounded-full bg-emerald-500 dark:bg-emerald-400" />
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Language Toggle */}
      <button
        type="button"
        onClick={() => setLocale(locale === 'th' ? 'en' : 'th' as Locale)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/60 shrink-0"
      >
        <Globe className="h-4 w-4" />
        {locale === 'th' ? 'EN' : 'TH'}
      </button>
    </div>
  )
}
