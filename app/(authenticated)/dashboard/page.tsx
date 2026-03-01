'use client'

import Link from 'next/link'
import { Package, Target, DollarSign, Users, ContactRound, Calendar, Banknote, Shield } from 'lucide-react'

const modules = [
  {
    key: 'crm',
    icon: ContactRound,
    label: 'CRM',
    sublabel: '',
    href: '/crm',
    color: 'from-blue-600 to-blue-800',
  },
  {
    key: 'events',
    icon: Calendar,
    label: 'EVENTS',
    sublabel: '',
    href: '/events',
    color: 'from-sky-500 to-sky-700',
  },
  {
    key: 'stock',
    icon: Package,
    label: 'STOCK',
    sublabel: '',
    href: '/stock/dashboard',
    color: 'from-zinc-700 to-zinc-900',
  },
  {
    key: 'costs',
    icon: DollarSign,
    label: 'COSTS',
    sublabel: '',
    href: '/costs/dashboard',
    color: 'from-emerald-600 to-emerald-800',
  },
  {
    key: 'finance',
    icon: Banknote,
    label: 'FINANCE',
    sublabel: '',
    href: '/finance',
    color: 'from-teal-600 to-teal-800',
  },
  {
    key: 'kpi',
    icon: Target,
    label: 'KPI',
    sublabel: '',
    href: '/kpi/dashboard',
    color: 'from-amber-600 to-amber-800',
  },
  {
    key: 'security',
    icon: Shield,
    label: 'SECURITY',
    sublabel: '',
    href: '/security',
    color: 'from-red-600 to-red-800',
    adminOnly: true,
  },
  {
    key: 'admin',
    icon: Users,
    label: 'USER',
    sublabel: 'MANAGEMENT',
    href: '/users',
    color: 'from-purple-600 to-purple-800',
    adminOnly: true,
  },
]

export default function ModuleHubPage() {
  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5 w-full max-w-2xl">
        {modules.map((mod) => (
          <Link
            key={mod.key}
            href={mod.href}
            className={`group relative aspect-square bg-gradient-to-br ${mod.color} rounded-2xl md:rounded-3xl flex flex-col items-center justify-center gap-1 transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl active:scale-[0.98]`}
          >
            {/* Subtle hover glow */}
            <div className="absolute inset-0 rounded-2xl md:rounded-3xl bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <mod.icon className="h-6 w-6 md:h-7 md:w-7 text-white/60 mb-1 relative z-10" />
            <span className="text-white text-lg md:text-2xl font-light tracking-[0.15em] relative z-10">
              {mod.label}
            </span>
            {mod.sublabel && (
              <span className="text-white/70 text-[10px] md:text-xs font-light tracking-[0.2em] relative z-10">
                {mod.sublabel}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}

