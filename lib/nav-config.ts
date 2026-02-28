import { Package, Archive, Calendar, CheckCircle2, FileText, LayoutGrid, Users, Target, DollarSign, LayoutDashboard, UserCheck, ClipboardCheck, BarChart3, ContactRound, Settings, Banknote, Import, List, Download } from 'lucide-react'

export type ModuleKey = 'crm' | 'events' | 'stock' | 'costs' | 'finance' | 'kpi' | 'admin'

export const ALL_MODULES: ModuleKey[] = ['crm', 'events', 'stock', 'costs', 'finance', 'kpi']

export interface NavItem {
  href: string
  icon: typeof Package
  labelKey: string
  description?: string
}

export interface NavGroup {
  key: ModuleKey
  icon: typeof Package
  adminOnly?: boolean
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'crm',
    icon: ContactRound,
    items: [
      { href: '/crm', icon: LayoutDashboard, labelKey: 'crmDashboard' },
    ],
  },
  {
    key: 'events',
    icon: Calendar,
    items: [
      { href: '/events', icon: Calendar, labelKey: 'events' },
      { href: '/events/event-closures', icon: CheckCircle2, labelKey: 'eventClosures' },
    ],
  },
  {
    key: 'stock',
    icon: Package,
    items: [
      { href: '/stock/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
      { href: '/items', icon: Package, labelKey: 'inventory' },
      { href: '/kits', icon: Archive, labelKey: 'kits' },
      { href: '/example-kits', icon: FileText, labelKey: 'examples' },
    ],
  },

  {
    key: 'costs',
    icon: DollarSign,
    items: [
      { href: '/costs/dashboard', icon: LayoutDashboard, labelKey: 'costsDashboard' },
      { href: '/costs/import', icon: Import, labelKey: 'costsImport' },
      { href: '/costs/events', icon: List, labelKey: 'costsEvents' },
      { href: '/costs/reports', icon: BarChart3, labelKey: 'costsReports' },
      { href: '/costs/download', icon: Download, labelKey: 'costsDownload' },
    ],
  },
  {
    key: 'finance',
    icon: Banknote,
    items: [
      { href: '/finance', icon: Banknote, labelKey: 'finance' },
    ],
  },
  {
    key: 'kpi',
    icon: Target,
    items: [
      { href: '/kpi/dashboard', icon: LayoutDashboard, labelKey: 'kpiDashboard' },
      { href: '/kpi/templates', icon: FileText, labelKey: 'kpiTemplates' },
      { href: '/kpi/assignments', icon: UserCheck, labelKey: 'kpiAssignments' },
      { href: '/kpi/evaluate', icon: ClipboardCheck, labelKey: 'kpiEvaluate' },
      { href: '/kpi/reports', icon: BarChart3, labelKey: 'kpiReports' },
    ],
  },
  {
    key: 'admin',
    icon: LayoutGrid,
    adminOnly: true,
    items: [
      { href: '/settings', icon: Settings, labelKey: 'settings' },
      { href: '/logs', icon: LayoutGrid, labelKey: 'logs' },
      { href: '/users', icon: Users, labelKey: 'users' },
    ],
  },
]

/** Get all route paths belonging to a module */
export function getModuleRoutes(moduleKey: ModuleKey): string[] {
  const group = NAV_GROUPS.find((g) => g.key === moduleKey)
  return group ? group.items.map((item) => item.href) : []
}

/** Check if a path belongs to a given module */
export function isRouteInModule(pathname: string, moduleKey: ModuleKey): boolean {
  const routes = getModuleRoutes(moduleKey)
  return routes.some((route) => pathname === route || pathname.startsWith(route + '/'))
}

/** Check if user has access to a given path */
export function hasAccessToRoute(pathname: string, allowedModules: string[], role: string): boolean {
  for (const group of NAV_GROUPS) {
    const belongsToGroup = group.items.some(
      (item) => pathname === item.href || pathname.startsWith(item.href + '/')
    )
    if (belongsToGroup) {
      if (group.adminOnly && role !== 'admin') return false
      if (!allowedModules.includes(group.key)) return false
      return true
    }
  }
  // Routes not in any group (e.g. /dashboard) are always accessible
  return true
}
