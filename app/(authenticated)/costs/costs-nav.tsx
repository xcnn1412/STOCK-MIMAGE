'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Import, List, BarChart3, Download } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'

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
  const { locale } = useLocale()

  const t = labels[locale] || labels.th

  return (
    <nav className="flex gap-1 overflow-x-auto pb-0.5 -mb-0.5"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {tabMeta.map((tab) => {
        const Icon = tab.icon
        const isActive = pathname.startsWith(tab.href)
        const label = t[tab.key]
        return (
          <Link
            key={tab.href}
            href={tab.href}
            title={label}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${isActive
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
