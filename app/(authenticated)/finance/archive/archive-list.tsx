'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Archive, Search, ExternalLink, CheckCircle2, Calendar } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { getCategoryLabel, getClaimStatusColor } from '../../costs/types'
import type { ExpenseClaim } from '../../costs/types'
import type { FinanceCategory } from '../settings-actions'

function calcTax(amount: number, vatMode: string, whtRatePercent: number) {
  let baseAmount = amount
  let vatAmount = 0
  let totalWithVat = amount
  if (vatMode === 'included') {
    baseAmount = amount / 1.07
    vatAmount = amount - baseAmount
    totalWithVat = amount
  } else if (vatMode === 'excluded') {
    vatAmount = amount * 0.07
    totalWithVat = amount + vatAmount
  }
  const whtAmount = baseAmount * (whtRatePercent / 100)
  const netPayable = totalWithVat - whtAmount
  return { baseAmount, vatAmount, totalWithVat, whtAmount, netPayable }
}

const fmtDec = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ArchiveList({ claims, categories }: { claims: ExpenseClaim[]; categories: FinanceCategory[] }) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return claims
    const q = searchQuery.trim().toLowerCase()
    return claims.filter(c => {
      const name = c.submitter?.full_name?.toLowerCase() || ''
      const title = c.title?.toLowerCase() || ''
      const num = c.claim_number?.toLowerCase() || ''
      return name.includes(q) || title.includes(q) || num.includes(q)
    })
  }, [claims, searchQuery])

  // Stats
  const totalNet = useMemo(() => {
    let total = 0
    filtered.forEach(c => {
      const amt = c.total_amount || c.amount || 0
      const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
      total += tax.netPayable
    })
    return total
  }, [filtered])

  const selectCls = 'px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-teal-100 dark:bg-teal-900/30">
            <Archive className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {isEn ? 'Payment Archive' : 'คลังเก็บใบเบิก'}
            </h2>
            <p className="text-xs text-zinc-400">
              {filtered.length} {isEn ? 'paid claims' : 'รายการที่ชำระแล้ว'} • {isEn ? 'Total paid' : 'จ่ายรวม'} ฿{fmtDec(totalNet)}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={isEn ? 'Search...' : 'ค้นหา...'}
            className={`${selectCls} pl-8 w-full`}
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 text-sm">
          {isEn ? 'No paid claims in archive' : 'ยังไม่มีใบเบิกในคลังเก็บ'}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold bg-zinc-50 dark:bg-zinc-800/30 border-b border-zinc-200 dark:border-zinc-800">
            <div className="col-span-2">{isEn ? 'Claim No.' : 'เลขที่'}</div>
            <div className="col-span-2">{isEn ? 'Submitter' : 'ผู้เบิก'}</div>
            <div className="col-span-2">{isEn ? 'Title' : 'หัวข้อ'}</div>
            <div className="col-span-1">{isEn ? 'Category' : 'หมวด'}</div>
            <div className="col-span-1 text-right">{isEn ? 'Net Paid' : 'จ่ายจริง'}</div>
            <div className="col-span-2">{isEn ? 'Paid At' : 'วันที่ชำระ'}</div>
            <div className="col-span-1">{isEn ? 'Status' : 'สถานะ'}</div>
            <div className="col-span-1"></div>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.map(c => {
              const amt = c.total_amount || c.amount || 0
              const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
              return (
                <div key={c.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                  <div className="col-span-2 text-xs font-mono text-zinc-500">{c.claim_number}</div>
                  <div className="col-span-2 truncate font-medium text-zinc-700 dark:text-zinc-300">
                    {c.submitter?.full_name || '—'}
                  </div>
                  <div className="col-span-2 truncate text-zinc-900 dark:text-zinc-100">{c.title}</div>
                  <div className="col-span-1 text-xs text-zinc-500">
                    {getCategoryLabel(c.category, locale, categories)}
                  </div>
                  <div className="col-span-1 text-right font-mono font-bold text-teal-600 dark:text-teal-400">
                    ฿{fmtDec(tax.netPayable)}
                  </div>
                  <div className="col-span-2 text-xs text-zinc-500">
                    {c.paid_at
                      ? new Date(c.paid_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—'
                    }
                  </div>
                  <div className="col-span-1">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-teal-50 text-teal-600 dark:bg-teal-950/30 dark:text-teal-400">
                      <CheckCircle2 className="h-3 w-3" />
                      {isEn ? 'Paid' : 'ชำระแล้ว'}
                    </span>
                  </div>
                  <div className="col-span-1 text-right">
                    <Link href={`/finance/${c.id}`} className="text-zinc-400 hover:text-teal-500 transition-colors">
                      <ExternalLink className="h-3.5 w-3.5 inline" />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
