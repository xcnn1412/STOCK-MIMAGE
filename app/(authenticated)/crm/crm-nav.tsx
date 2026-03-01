'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ContactRound, LayoutDashboard, Archive, CalendarDays, BarChart3, Download } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'

const tabMeta = [
  { href: '/crm', key: 'kanban' as const, icon: LayoutDashboard, exact: true, adminOnly: false },
  { href: '/crm/dashboard', key: 'dashboard' as const, icon: BarChart3, exact: false, adminOnly: false },
  { href: '/crm/payments', key: 'payments' as const, icon: CalendarDays, exact: false, adminOnly: false },
  { href: '/crm/download', key: 'download' as const, icon: Download, exact: false, adminOnly: true },
  { href: '/crm/archive', key: 'archive' as const, icon: Archive, exact: false, adminOnly: false },
]

const labels = {
  en: {
    kanban: 'Kanban',
    dashboard: 'Dashboard',
    payments: 'Payments',
    download: 'Download',
    archive: 'Archive',
  },
  th: {
    kanban: 'Kanban',
    dashboard: 'แดชบอร์ด',
    payments: 'การชำระเงิน',
    download: 'ดาวน์โหลด',
    archive: 'คลังเก็บ',
  },
}

export default function CrmNav({ role }: { role: string }) {
  const pathname = usePathname()
  const { locale } = useLocale()

  const t = labels[locale] || labels.th

  const isActive = (href: string, exact: boolean) => {
    if (exact) {
      return pathname === href || (pathname.startsWith('/crm/') && !pathname.startsWith('/crm/settings') && !pathname.startsWith('/crm/archive') && !pathname.startsWith('/crm/payments') && !pathname.startsWith('/crm/dashboard') && !pathname.startsWith('/crm/download'))
    }
    return pathname.startsWith(href)
  }

  return (
    <div className="flex items-center gap-3">
      {/* CRM Brand Mark */}
      <div className="flex items-center gap-2.5 pr-4 border-r border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm shadow-blue-500/25">
          <ContactRound className="h-4.5 w-4.5" />
        </div>
        <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100 hidden sm:block">
          CRM
        </span>
      </div>

      {/* Navigation Tabs — scrollable on mobile */}
      <nav className="flex gap-1 overflow-x-auto scrollbar-none pb-0.5 -mb-0.5"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tabMeta
          .filter(tab => !tab.adminOnly || role === 'admin')
          .map(tab => {
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
                    ? 'text-blue-700 dark:text-blue-300 bg-blue-50/80 dark:bg-blue-950/40'
                    : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/60'
                  }
              `}
              >
                <Icon className={`h-4 w-4 shrink-0 transition-colors ${active ? 'text-blue-600 dark:text-blue-400' : ''}`} />
                <span className="hidden sm:inline">{label}</span>
                {active && (
                  <span className="absolute -bottom-[9px] left-3 right-3 h-[2px] rounded-full bg-blue-500 dark:bg-blue-400" />
                )}
              </Link>
            )
          })}
      </nav>
    </div>
  )
}
