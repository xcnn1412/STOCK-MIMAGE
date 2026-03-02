'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Banknote, LayoutDashboard, PlusCircle, Globe, Wallet, Archive, BarChart3, Download } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import type { Locale } from '@/lib/i18n'

const tabMeta = [
  { href: '/finance', key: 'claims' as const, icon: LayoutDashboard, exact: true },
  { href: '/finance/overview', key: 'overview' as const, icon: BarChart3, exact: false },
  { href: '/finance/payouts', key: 'payouts' as const, icon: Wallet, exact: false },
  { href: '/finance/archive', key: 'archive' as const, icon: Archive, exact: false },
  { href: '/finance/download', key: 'download' as const, icon: Download, exact: false },
  { href: '/finance/new', key: 'newClaim' as const, icon: PlusCircle, exact: false },
]

const labels = {
  en: { claims: 'All Claims', overview: 'Overview', payouts: 'Payouts', archive: 'Archive', download: 'Download', newClaim: 'New Claim' },
  th: { claims: 'ใบเบิก', overview: 'ภาพรวม', payouts: 'สรุปยอดจ่าย', archive: 'คลังเก็บ', download: 'ดาวน์โหลด', newClaim: 'สร้างใบเบิก' },
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
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        {/* Finance Brand Mark */}
        <div className="flex items-center gap-2 sm:gap-2.5 pr-3 sm:pr-4 border-r border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-linear-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/25">
            <Banknote className="h-4.5 w-4.5" />
          </div>
          <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100 hidden sm:block">
            Finance
          </span>
        </div>

        {/* Tabs — horizontal scroll on mobile */}
        <nav className="flex gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {tabMeta.map(tab => {
            const Icon = tab.icon
            const active = isActive(tab.href, tab.exact)
            const label = t[tab.key]
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`
                  relative flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium
                  transition-all duration-200 whitespace-nowrap shrink-0
                  ${active
                    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/40'
                    : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/60'
                  }
                `}
              >
                <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 transition-colors ${active ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
                <span className="hidden xs:inline sm:inline">{label}</span>
                {active && (
                  <span className="absolute -bottom-[9px] left-3 right-3 h-[2px] rounded-full bg-emerald-500 dark:bg-emerald-400 hidden sm:block" />
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
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/60 shrink-0 self-end sm:self-auto"
      >
        <Globe className="h-4 w-4" />
        {locale === 'th' ? 'EN' : 'TH'}
      </button>
    </div>
  )
}
