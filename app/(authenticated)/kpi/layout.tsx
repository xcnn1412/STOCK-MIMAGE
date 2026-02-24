'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, UserCheck, ClipboardCheck, BarChart3, Download } from 'lucide-react'

const tabs = [
  { href: '/kpi/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/kpi/templates', label: 'Templates', icon: FileText },
  { href: '/kpi/assignments', label: 'Assignments', icon: UserCheck },
  { href: '/kpi/evaluate', label: 'Evaluate', icon: ClipboardCheck },
  { href: '/kpi/reports', label: 'Reports', icon: BarChart3 },
  { href: '/kpi/download', label: 'Download', icon: Download },
]

export default function KpiLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="-mb-px flex gap-1 overflow-x-auto scrollbar-hide" aria-label="KPI Tabs">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                  ${isActive
                    ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 dark:text-zinc-400 dark:hover:text-zinc-300 dark:hover:border-zinc-600'
                  }
                `}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Page Content */}
      {children}
    </div>
  )
}
