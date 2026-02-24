'use client'

import Link from 'next/link'
import { Package, Target, DollarSign, Users } from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'

const modules = [
  {
    key: 'stock',
    icon: Package,
    label: 'STOCK',
    sublabel: '',
    href: '/stock/dashboard',
    description: 'ระบบจัดการคลังอุปกรณ์',
  },
  {
    key: 'kpi',
    icon: Target,
    label: 'KPI',
    sublabel: '',
    href: '/kpi/dashboard',
    description: 'ระบบประเมิน KPI',
  },
  {
    key: 'costs',
    icon: DollarSign,
    label: 'COST',
    sublabel: '',
    href: '/costs',
    description: 'ระบบคิดต้นทุนอีเวนต์',
  },
  {
    key: 'admin',
    icon: Users,
    label: 'USER',
    sublabel: 'MANAGEMENT',
    href: '/users',
    description: 'จัดการผู้ใช้งาน',
  },
]

export default function ModuleHubPage() {
  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4">
      <div className="grid grid-cols-2 gap-4 md:gap-6 w-full max-w-lg">
        {modules.map((mod) => (
          <Link
            key={mod.key}
            href={mod.href}
            className="group relative aspect-square bg-zinc-900 dark:bg-zinc-800 rounded-2xl md:rounded-3xl flex flex-col items-center justify-center gap-1 transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl hover:shadow-zinc-900/30 active:scale-[0.98]"
          >
            {/* Subtle hover glow */}
            <div className="absolute inset-0 rounded-2xl md:rounded-3xl bg-linear-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            <span className="text-white text-2xl md:text-3xl font-light tracking-[0.15em] relative z-10">
              {mod.label}
            </span>
            {mod.sublabel && (
              <span className="text-white/70 text-xs md:text-sm font-light tracking-[0.2em] relative z-10">
                {mod.sublabel}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
