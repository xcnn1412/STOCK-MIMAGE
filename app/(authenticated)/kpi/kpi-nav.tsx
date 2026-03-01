'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, UserCheck, ClipboardCheck, BarChart3, Download } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'

const tabMeta = [
  { href: '/kpi/dashboard', key: 'dashboard' as const, icon: LayoutDashboard, adminOnly: false },
  { href: '/kpi/templates', key: 'templates' as const, icon: FileText, adminOnly: false },
  { href: '/kpi/assignments', key: 'assignments' as const, icon: UserCheck, adminOnly: false },
  { href: '/kpi/evaluate', key: 'evaluate' as const, icon: ClipboardCheck, adminOnly: false },
  { href: '/kpi/reports', key: 'reports' as const, icon: BarChart3, adminOnly: false },
  { href: '/kpi/download', key: 'download' as const, icon: Download, adminOnly: false },
]

export default function KpiNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const { t } = useLocale()

  const visibleTabs = tabMeta.filter(tab => !tab.adminOnly || isAdmin)

  return (
    <nav className="flex gap-1 overflow-x-auto pb-0.5 -mb-0.5"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {visibleTabs.map((tab) => {
        const Icon = tab.icon
        const isActive = pathname.startsWith(tab.href)
        const label = t.kpi.layout[tab.key]
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
