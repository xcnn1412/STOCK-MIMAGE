'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PlusCircle, FileText, Clock, CheckCircle2, XCircle, Filter, Banknote } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import type { ExpenseClaim } from '../costs/types'
import { CLAIM_STATUSES, getClaimStatusLabel, getClaimStatusColor, getCategoryLabel } from '../costs/types'
import type { FinanceCategory } from './settings-actions'

const statusIcons: Record<string, typeof Clock> = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
}

export default function ClaimsListView({ claims, error, categories = [] }: { claims: ExpenseClaim[]; error: string | null; categories?: FinanceCategory[] }) {
  const { locale } = useLocale()
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const filtered = filterStatus === 'all' ? claims : claims.filter(c => c.status === filterStatus)

  // Stats
  const totalPending = claims.filter(c => c.status === 'pending').length
  const totalApproved = claims.filter(c => c.status === 'approved').reduce((sum, c) => sum + (c.total_amount || 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {locale === 'th' ? 'ใบเบิกเงิน' : 'Expense Claims'}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {locale === 'th' ? `${claims.length} รายการ` : `${claims.length} claims`}
            {totalPending > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                • {totalPending} {locale === 'th' ? 'รออนุมัติ' : 'pending'}
              </span>
            )}
          </p>
        </div>
        <Link
          href="/finance/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <PlusCircle className="h-4 w-4" />
          {locale === 'th' ? 'สร้างใบเบิก' : 'New Claim'}
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 mb-1">{locale === 'th' ? 'ทั้งหมด' : 'Total'}</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{claims.length}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-amber-600 mb-1">{locale === 'th' ? 'รออนุมัติ' : 'Pending'}</p>
          <p className="text-2xl font-bold text-amber-600">{totalPending}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-emerald-600 mb-1">{locale === 'th' ? 'อนุมัติแล้ว' : 'Approved'}</p>
          <p className="text-2xl font-bold text-emerald-600">
            {claims.filter(c => c.status === 'approved').length}
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 mb-1">{locale === 'th' ? 'ยอดอนุมัติ' : 'Approved Total'}</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            ฿{totalApproved.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-zinc-400" />
        <div className="flex gap-1">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterStatus === 'all'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
            }`}
          >
            {locale === 'th' ? 'ทั้งหมด' : 'All'}
          </button>
          {CLAIM_STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => setFilterStatus(s.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterStatus === s.value
                  ? 'text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
              }`}
              style={filterStatus === s.value ? { backgroundColor: s.color } : {}}
            >
              {locale === 'th' ? s.labelTh : s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Claims List */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-xl text-red-600 text-sm">{error}</div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
          <Banknote className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">{locale === 'th' ? 'ยังไม่มีใบเบิก' : 'No claims yet'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(claim => {
            const StatusIcon = statusIcons[claim.status] || Clock
            const statusColor = getClaimStatusColor(claim.status)
            return (
              <Link
                key={claim.id}
                href={`/finance/${claim.id}`}
                className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0"
                    style={{ backgroundColor: `${statusColor}15` }}
                  >
                    <StatusIcon className="h-5 w-5" style={{ color: statusColor }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-400">{claim.claim_number}</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                        style={{ backgroundColor: statusColor }}
                      >
                        {getClaimStatusLabel(claim.status, locale)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {claim.claim_type === 'event' ? (locale === 'th' ? 'อีเวนต์' : 'Event') : (locale === 'th' ? 'ค่าอื่นๆ' : 'Other')}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate mt-1">
                      {claim.title}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {claim.submitter?.full_name || '—'} • {new Date(claim.expense_date).toLocaleDateString('th-TH')}
                      {(claim.job_event as any)?.name && ` • ${(claim.job_event as any).name}`}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    ฿{(claim.total_amount || 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {getCategoryLabel(claim.category, locale, categories)}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
