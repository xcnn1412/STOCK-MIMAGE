'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Import, List, BarChart3, Download, Globe } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import type { Locale } from '@/lib/i18n'

const tabMeta = [
  { href: '/costs/dashboard', key: 'dashboard' as const, icon: LayoutDashboard },
  { href: '/costs/import', key: 'import' as const, icon: Import },
  { href: '/costs/events', key: 'events' as const, icon: List },
  { href: '/costs/reports', key: 'reports' as const, icon: BarChart3 },
  { href: '/costs/download', key: 'download' as const, icon: Download },
]

const labels = {
  en: {
    dashboard: 'Dashboard',
    import: 'Import',
    events: 'Events',
    reports: 'Reports',
    download: 'Download',
  },
  th: {
    dashboard: 'แดชบอร์ด',
    import: 'นำเข้า',
    events: 'รายการงาน',
    reports: 'รายงาน',
    download: 'ดาวน์โหลด',
  },
}

export default function CostsNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const { locale, setLocale } = useLocale()

  const toggleLocale = () => {
    setLocale(locale === 'th' ? 'en' : 'th' as Locale)
  }

  const t = labels[locale] || labels.th

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabMeta.map((tab) => {
          const Icon = tab.icon
          const isActive = pathname.startsWith(tab.href)
          const label = t[tab.key]
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
