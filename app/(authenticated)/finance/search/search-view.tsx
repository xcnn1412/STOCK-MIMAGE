'use client'

// ============================================================================
// ผลการค้นหาใบเบิก (/finance/search?q=) — ช่องค้นหาอยู่บนหัวเมนูใบเบิก (finance-nav.tsx)
// ค้นเลขที่ หัวข้อ ชื่อผู้เบิก ชื่องาน ทุกสถานะทุกเดือน (search-data.ts) · พนักงานเห็นเฉพาะใบของตัวเอง
// แสดงไม่เกิน 100 ใบ (ใหม่ → เก่า) — มากกว่านั้นบอกให้พิมพ์ให้เจาะจงขึ้น
// ============================================================================

import Link from 'next/link'
import { AlertCircle, CalendarDays, ChevronRight, Search, User } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { calcTax } from '@/lib/finance/money'
import { StatusBadge } from '../status-badge'
import type { SearchHit } from '../view-data'

const fmtDec = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const netOf = (c: SearchHit) =>
  calcTax(Number(c.amount) || 0, c.vat_mode || 'none', Number(c.withholding_tax_rate) || 0).netPayable

const dateLabel = (value: string | null, isEn: boolean, withDay = true) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(isEn ? 'en-GB' : 'th-TH', withDay
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { month: 'short', year: 'numeric' })
}

export default function SearchView({
  q,
  hits,
  truncated,
  isAdmin,
}: {
  q: string
  hits: SearchHit[]
  truncated: boolean
  isAdmin: boolean
}) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  const query = q.trim()

  return (
    <section aria-labelledby="finance-search-title" className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60">
          <Search className="h-5 w-5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="finance-search-title" className="text-base font-bold text-zinc-900 break-words sm:text-lg dark:text-zinc-100">
            {query
              ? (isEn ? `Results for “${query}”: ${hits.length}` : `ผลการค้นหา “${query}” ${hits.length} ใบ`)
              : (isEn ? 'Search claims' : 'ค้นหาใบเบิก')}
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {isAdmin
              ? (isEn ? 'Claim no., title, submitter or event — every status and month' : 'เลขที่ หัวข้อ ชื่อผู้เบิก ชื่องาน — ทุกสถานะ ทุกเดือน')
              : (isEn ? 'Your own claims — every status and month' : 'เฉพาะใบเบิกของคุณ — ทุกสถานะ ทุกเดือน')}
          </p>
        </div>
      </div>

      {truncated && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {isEn ? 'Showing the first 100 claims — type something more specific' : 'แสดง 100 ใบแรก — พิมพ์ให้เจาะจงขึ้น'}
        </p>
      )}

      {!query ? (
        <p className="rounded-xl border border-dashed border-zinc-300 py-12 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          {isEn ? 'Type in the search box above, then press Enter' : 'พิมพ์คำค้นแล้วกด Enter'}
        </p>
      ) : hits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-600 break-words dark:border-zinc-700 dark:text-zinc-400">
          {isEn ? `No claims match “${query}”` : `ไม่พบใบเบิกที่ตรงกับ “${query}”`}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {hits.map(c => {
            const paidMonth = c.paid_at ? dateLabel(c.paid_at, isEn, false) : ''
            return (
              <li key={c.id}>
                <Link
                  href={`/finance/${c.id}`}
                  className="flex min-h-10 items-center gap-3 px-3 py-3 transition-colors hover:bg-zinc-50 focus-visible:bg-zinc-50 sm:px-4 dark:hover:bg-zinc-800/40 dark:focus-visible:bg-zinc-800/40"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{c.claim_number}</span>
                      <StatusBadge status={c.status} isEn={isEn} />
                    </div>
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.title}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{c.submitter?.full_name || '—'}</span>
                      </span>
                      {c.job_event?.event_name && (
                        <span className="min-w-0 truncate">· {c.job_event.event_name}</span>
                      )}
                      {c.expense_date && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {dateLabel(c.expense_date, isEn)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">฿{fmtDec(netOf(c))}</p>
                    {paidMonth && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">{isEn ? `Paid ${paidMonth}` : `จ่าย ${paidMonth}`}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
