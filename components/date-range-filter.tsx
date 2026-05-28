'use client'

import { ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface DateRangeFilterProps {
  icon: React.ReactNode
  labelTh: string
  labelEn: string
  from: string
  to: string
  onChange: (from: string, to: string) => void
  locale: 'th' | 'en'
}

function toIsoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function DateRangeFilter({ icon, labelTh, labelEn, from, to, onChange, locale }: DateRangeFilterProps) {
  const label = locale === 'th' ? labelTh : labelEn
  const active = Boolean(from || to)

  const applyPreset = (preset: 'today' | 'week' | 'month') => {
    const now = new Date()
    if (preset === 'today') {
      const d = toIsoDay(now)
      onChange(d, d)
      return
    }
    if (preset === 'week') {
      // Monday → Sunday
      const day = now.getDay() // 0 = Sun
      const offsetToMon = day === 0 ? -6 : 1 - day
      const mon = new Date(now); mon.setDate(now.getDate() + offsetToMon)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      onChange(toIsoDay(mon), toIsoDay(sun))
      return
    }
    if (preset === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      onChange(toIsoDay(first), toIsoDay(last))
      return
    }
  }

  const summary = active
    ? (from && to
      ? (from === to ? from : `${from} → ${to}`)
      : (from ? `≥ ${from}` : `≤ ${to}`))
    : null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-9 gap-1.5 text-sm font-normal ${active
            ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
            : ''
            }`}
        >
          {icon}
          <span>{label}</span>
          {summary && (
            <span className="hidden sm:inline text-[11px] opacity-80 max-w-[160px] truncate">
              {summary}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{label}</div>
          {active && (
            <button
              type="button"
              onClick={() => onChange('', '')}
              className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 dark:text-blue-400"
            >
              <X className="h-3 w-3" />
              {locale === 'th' ? 'ล้าง' : 'Clear'}
            </button>
          )}
        </div>

        <div className="space-y-2">
          <label className="block">
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {locale === 'th' ? 'จากวันที่' : 'From'}
            </span>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={e => onChange(e.target.value, to)}
              className="mt-1 w-full h-9 px-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {locale === 'th' ? 'ถึงวันที่' : 'To'}
            </span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={e => onChange(from, e.target.value)}
              className="mt-1 w-full h-9 px-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100"
            />
          </label>
        </div>

        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5">
            {locale === 'th' ? 'ทางลัด' : 'Presets'}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyPreset('today')}
              className="px-2 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            >
              {locale === 'th' ? 'วันนี้' : 'Today'}
            </button>
            <button
              type="button"
              onClick={() => applyPreset('week')}
              className="px-2 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            >
              {locale === 'th' ? 'สัปดาห์นี้' : 'This week'}
            </button>
            <button
              type="button"
              onClick={() => applyPreset('month')}
              className="px-2 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            >
              {locale === 'th' ? 'เดือนนี้' : 'This month'}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
