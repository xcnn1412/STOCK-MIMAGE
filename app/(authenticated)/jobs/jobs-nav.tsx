'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Briefcase, LayoutDashboard, Archive, Settings, BarChart3 } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'

const tabMeta = [
  { href: '/jobs', key: 'board' as const, icon: LayoutDashboard, exact: true },
  { href: '/jobs/archive', key: 'archive' as const, icon: Archive, exact: false },
  { href: '/jobs/report', key: 'report' as const, icon: BarChart3, exact: false },
  { href: '/jobs/settings', key: 'settings' as const, icon: Settings, exact: false },
]

const labels = {
  en: {
    board: 'Board',
    archive: 'Archive',
    report: 'Report',
    settings: 'Settings',
  },
  th: {
    board: 'Board',
    archive: 'คลังเก็บ',
    report: 'รายงาน',
    settings: 'ตั้งค่า',
  },
}

export default function JobsNav() {
  const pathname = usePathname()
  const { locale } = useLocale()

  const t = labels[locale] || labels.th

  const isActive = (href: string, exact: boolean) => {
    if (exact) {
      // Active for /jobs, /jobs/[id], and /jobs/tickets — but NOT /jobs/settings, /jobs/archive, or /jobs/report
      return pathname === href || (pathname.startsWith('/jobs/') && !pathname.startsWith('/jobs/settings') && !pathname.startsWith('/jobs/archive') && !pathname.startsWith('/jobs/report'))
    }
    return pathname.startsWith(href)
  }

  return (
    <div className="flex items-center gap-3">
      {/* Jobs Brand Mark */}
      <div className="flex items-center gap-2.5 pr-4 border-r border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm shadow-violet-500/25">
          <Briefcase className="h-4.5 w-4.5" />
        </div>
        <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100 hidden sm:block">
          Jobs
        </span>
      </div>

      {/* Navigation Tabs */}
      <nav className="flex gap-1 overflow-x-auto scrollbar-none pb-0.5 -mb-0.5"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tabMeta.map(tab => {
          const Icon = tab.icon
          const active = isActive(tab.href, tab.exact)
          const label = t[tab.key]
          return (
            <Link
              key={tab.href}
              href={tab.href}
              title={label}
              className={`
                relative flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-lg text-sm font-medium
                transition-all duration-200 whitespace-nowrap shrink-0
                ${active
                  ? 'text-violet-700 dark:text-violet-300 bg-violet-50/80 dark:bg-violet-950/40'
                  : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/60'
                }
              `}
            >
              <Icon className={`h-4 w-4 shrink-0 transition-colors ${active ? 'text-violet-600 dark:text-violet-400' : ''}`} />
              <span className="hidden sm:inline">{label}</span>
              {active && (
                <span className="absolute -bottom-[9px] left-3 right-3 h-[2px] rounded-full bg-violet-500 dark:bg-violet-400" />
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
