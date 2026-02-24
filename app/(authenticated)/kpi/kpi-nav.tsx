'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, UserCheck, ClipboardCheck, BarChart3, Download, Globe } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import type { Locale } from '@/lib/i18n'

const tabMeta = [
  { href: '/kpi/dashboard', key: 'dashboard' as const, icon: LayoutDashboard, adminOnly: false },
  { href: '/kpi/templates', key: 'templates' as const, icon: FileText, adminOnly: false },
  { href: '/kpi/assignments', key: 'assignments' as const, icon: UserCheck, adminOnly: false },
  { href: '/kpi/evaluate', key: 'evaluate' as const, icon: ClipboardCheck, adminOnly: false },
  { href: '/kpi/reports', key: 'reports' as const, icon: BarChart3, adminOnly: true },
  { href: '/kpi/download', key: 'download' as const, icon: Download, adminOnly: false },
]

export default function KpiNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const { locale, setLocale, t } = useLocale()

  const toggleLocale = () => {
    setLocale(locale === 'th' ? 'en' : 'th' as Locale)
  }

  const visibleTabs = tabMeta.filter(tab => !tab.adminOnly || isAdmin)

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon
          const isActive = pathname.startsWith(tab.href)
          const label = t.kpi.layout[tab.key]
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </div>

      {/* Language Toggle */}
      <button
        type="button"
        onClick={toggleLocale}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 shrink-0"
        title={locale === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย'}
      >
        <Globe className="h-4 w-4" />
        {locale === 'th' ? 'EN' : 'TH'}
      </button>
    </div>
  )
}
