import { Package, Archive, Calendar, CheckCircle2, FileText, LayoutGrid, Users, Target, DollarSign, LayoutDashboard, UserCheck, ClipboardCheck, BarChart3, ContactRound, Settings, ClipboardList } from 'lucide-react'

export type ModuleKey = 'crm' | 'events' | 'stock' | 'checkout' | 'costs' | 'kpi' | 'admin'

export const ALL_MODULES: ModuleKey[] = ['crm', 'events', 'stock', 'checkout', 'costs', 'kpi']

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
      { href: '/crm/settings', icon: Settings, labelKey: 'crmSettings' },
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
    key: 'checkout',
    icon: ClipboardList,
    items: [
      { href: '/checkout', icon: ClipboardList, labelKey: 'checkout' },
    ],
  },
  {
    key: 'costs',
    icon: DollarSign,
    items: [
      { href: '/costs', icon: DollarSign, labelKey: 'costs' },
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
