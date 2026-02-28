'use client'

import { useState } from 'react'
import { Settings, ContactRound, Banknote, ChevronRight } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import FinanceSettingsView from '@/app/(authenticated)/finance/settings/finance-settings-view'
import CrmSettingsView from '@/app/(authenticated)/crm/settings/settings-view'
import type { FinanceCategory, CategoryItem, StaffProfile } from '@/app/(authenticated)/finance/settings-actions'
import type { CrmSetting } from '@/app/(authenticated)/crm/crm-dashboard'

type SettingsSection = 'finance' | 'crm'

const sections: {
  key: SettingsSection
  icon: typeof Settings
  gradient: string
  shadow: string
  activeText: string
  activeBg: string
}[] = [
  {
    key: 'finance',
    icon: Banknote,
    gradient: 'from-emerald-500 to-teal-600',
    shadow: 'shadow-emerald-500/25',
    activeText: 'text-emerald-700 dark:text-emerald-300',
    activeBg: 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
  },
  {
    key: 'crm',
    icon: ContactRound,
    gradient: 'from-blue-500 to-indigo-600',
    shadow: 'shadow-blue-500/25',
    activeText: 'text-blue-700 dark:text-blue-300',
    activeBg: 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
  },
]

const labels = {
  en: {
    title: 'Settings',
    subtitle: 'Manage system-wide settings for all modules',
    finance: 'Finance & Costs',
    financeDesc: 'Expense categories, sub-items, and tax settings',
    crm: 'CRM',
    crmDesc: 'Packages, customer types, and lead sources',
  },
  th: {
    title: 'ตั้งค่าระบบ',
    subtitle: 'จัดการการตั้งค่าทั้งหมดของแต่ละโมดูล',
    finance: 'การเงิน & ต้นทุน',
    financeDesc: 'หมวดค่าใช้จ่าย, รายการย่อย, ภาษี',
    crm: 'CRM',
    crmDesc: 'แพ็กเกจ, ประเภทลูกค้า, แหล่งที่มา',
  },
}

interface Props {
  financeCategories: FinanceCategory[]
  categoryItems: CategoryItem[]
  staffProfiles: StaffProfile[]
  crmSettings: CrmSetting[]
}

export default function SettingsView({ financeCategories, categoryItems, staffProfiles, crmSettings }: Props) {
  const { locale } = useLocale()
  const t = labels[locale] || labels.th
  const [activeSection, setActiveSection] = useState<SettingsSection>('finance')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-linear-to-br from-zinc-700 to-zinc-900 dark:from-zinc-200 dark:to-zinc-400 text-white dark:text-zinc-900 shadow-sm">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
      </div>

      {/* Section Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sections.map(section => {
          const Icon = section.icon
          const isActive = activeSection === section.key
          const sectionLabel = t[section.key as keyof typeof t] as string
          const sectionDesc = t[`${section.key}Desc` as keyof typeof t] as string

          return (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key)}
              className={`
                group relative flex items-center gap-4 p-4 rounded-xl border text-left
                transition-all duration-300 ease-out
                ${isActive
                  ? `${section.activeBg} shadow-sm`
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm'
                }
              `}
            >
              {/* Icon */}
              <div className={`
                flex items-center justify-center h-11 w-11 rounded-xl shrink-0 transition-all duration-300
                ${isActive
                  ? `bg-linear-to-br ${section.gradient} text-white shadow-md ${section.shadow}`
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'
                }
              `}>
                <Icon className="h-5 w-5" />
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold transition-colors ${isActive ? section.activeText : 'text-zinc-700 dark:text-zinc-300'}`}>
                  {sectionLabel}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{sectionDesc}</p>
              </div>

              {/* Arrow */}
              <ChevronRight className={`h-4 w-4 shrink-0 transition-all duration-300 ${isActive ? `${section.activeText} translate-x-0.5` : 'text-zinc-300 dark:text-zinc-600'}`} />

              {/* Active line indicator */}
              {isActive && (
                <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-linear-to-b from-current to-current opacity-60" style={{ color: section.key === 'finance' ? '#10b981' : '#3b82f6' }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Content Area */}
      <div className="min-h-[400px]">
        {activeSection === 'finance' && (
          <div className="animate-in fade-in slide-in-from-left-2 duration-300">
            <FinanceSettingsView
              categories={financeCategories}
              categoryItems={categoryItems}
              staffProfiles={staffProfiles}
            />
          </div>
        )}
        {activeSection === 'crm' && (
          <div className="animate-in fade-in slide-in-from-right-2 duration-300">
            <CrmSettingsView settings={crmSettings} />
          </div>
        )}
      </div>
    </div>
  )
}
