'use client'

import Link from 'next/link'
import { Package, Target, DollarSign, Users, ContactRound, Calendar, Banknote, Shield, Briefcase, MapPinCheck } from 'lucide-react'

// Shine positions — each card gets a unique spotlight glow position
const shineVariants = [
  { bg: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.07) 0%, transparent 60%)', shadow: '0 0 40px rgba(255,255,255,0.04)' },
  { bg: 'radial-gradient(circle at 80% 30%, rgba(255,255,255,0.08) 0%, transparent 55%)', shadow: '0 0 35px rgba(255,255,255,0.05)' },
  { bg: 'radial-gradient(circle at 70% 80%, rgba(255,255,255,0.06) 0%, transparent 50%)', shadow: '0 0 45px rgba(255,255,255,0.03)' },
  { bg: 'radial-gradient(circle at 30% 70%, rgba(255,255,255,0.09) 0%, transparent 65%)', shadow: '0 0 30px rgba(255,255,255,0.06)' },
  { bg: 'radial-gradient(circle at 50% 10%, rgba(255,255,255,0.07) 0%, transparent 50%)', shadow: '0 0 50px rgba(255,255,255,0.04)' },
  { bg: 'radial-gradient(circle at 10% 50%, rgba(255,255,255,0.08) 0%, transparent 60%)', shadow: '0 0 38px rgba(255,255,255,0.05)' },
  { bg: 'radial-gradient(circle at 90% 60%, rgba(255,255,255,0.06) 0%, transparent 55%)', shadow: '0 0 42px rgba(255,255,255,0.04)' },
  { bg: 'radial-gradient(circle at 40% 90%, rgba(255,255,255,0.07) 0%, transparent 50%)', shadow: '0 0 36px rgba(255,255,255,0.05)' },
  { bg: 'radial-gradient(circle at 60% 40%, rgba(255,255,255,0.08) 0%, transparent 65%)', shadow: '0 0 44px rgba(255,255,255,0.03)' },
  { bg: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.07) 0%, transparent 55%)', shadow: '0 0 40px rgba(255,255,255,0.04)' },
]

const modules = [
  { key: 'crm', icon: ContactRound, label: 'CRM', sublabel: '', href: '/crm' },
  { key: 'jobs', icon: Briefcase, label: 'JOBS', sublabel: '', href: '/jobs' },
  { key: 'events', icon: Calendar, label: 'EVENTS', sublabel: '', href: '/events' },
  { key: 'stock', icon: Package, label: 'STOCK', sublabel: '', href: '/stock/dashboard' },
  { key: 'costs', icon: DollarSign, label: 'COSTS', sublabel: '', href: '/costs/dashboard' },
  { key: 'finance', icon: Banknote, label: 'FINANCE', sublabel: '', href: '/finance' },
  { key: 'kpi', icon: Target, label: 'KPI', sublabel: '', href: '/kpi/dashboard' },
  { key: 'checkin', icon: MapPinCheck, label: 'CHECK-IN', sublabel: '', href: '/check-in' },
  { key: 'security', icon: Shield, label: 'SECURITY', sublabel: '', href: '/security', adminOnly: true },
  { key: 'admin', icon: Users, label: 'USER', sublabel: 'MANAGEMENT', href: '/users', adminOnly: true },
]

export default function ModuleHubPage() {
  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5 w-full max-w-2xl">
        {modules.map((mod, i) => {
          const shine = shineVariants[i % shineVariants.length]
          return (
            <Link
              key={mod.key}
              href={mod.href}
              className="group relative aspect-square bg-zinc-900 dark:bg-zinc-800 border border-zinc-800 dark:border-zinc-700 rounded-2xl md:rounded-3xl flex flex-col items-center justify-center gap-1 transition-all duration-300 hover:scale-[1.03] hover:border-zinc-600 dark:hover:border-zinc-500 active:scale-[0.98] overflow-hidden"
              style={{ boxShadow: shine.shadow }}
            >
              {/* Unique shine spotlight per card */}
              <div
                className="absolute inset-0 rounded-2xl md:rounded-3xl transition-opacity duration-500 group-hover:opacity-150"
                style={{ background: shine.bg }}
              />

              {/* Hover glow overlay */}
              <div className="absolute inset-0 rounded-2xl md:rounded-3xl bg-white/0 group-hover:bg-white/[0.03] transition-all duration-300" />

              <mod.icon className="h-6 w-6 md:h-7 md:w-7 text-white/40 group-hover:text-white/70 mb-1 relative z-10 transition-colors duration-300" />
              <span className="text-white/90 text-lg md:text-2xl font-light tracking-[0.15em] relative z-10">
                {mod.label}
              </span>
              {mod.sublabel && (
                <span className="text-white/50 text-[10px] md:text-xs font-light tracking-[0.2em] relative z-10">
                  {mod.sublabel}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
