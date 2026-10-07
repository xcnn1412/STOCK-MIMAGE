'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { useLocale } from '@/lib/i18n/context'
import { EVENT_PHASES } from '../../event-phases'
import { getClaimStatusLabel, getClaimStatusColor } from '../../../costs/types'
import type { LeadCostSummary } from '../../actions'

// Cost Summary — Revenue (from lead) vs. Cost (claims across all linked events)
export function CostSummaryCard({ costSummary, linkedEventCount }: { costSummary: LeadCostSummary; linkedEventCount: number }) {
  const { locale } = useLocale()
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-500">
            {locale === 'th' ? 'สรุปต้นทุน — กำไรขั้นต้น' : 'Cost Summary — Gross P&L'}
          </span>
          <span className="text-[10px] text-zinc-400">
            {costSummary.claimCount} {locale === 'th' ? 'รายการเบิก' : 'claims'}
            {' • '}
            {linkedEventCount} {locale === 'th' ? 'อีเวนต์' : 'events'}
          </span>
        </div>
  
        {/* Top row: Revenue / Cost / Gross Profit */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/10 p-2.5 sm:p-3">
            <p className="text-[10px] uppercase tracking-wider text-emerald-600/70 dark:text-emerald-400/70 font-semibold">
              {locale === 'th' ? 'รายได้' : 'Revenue'}
            </p>
            <p className="text-lg sm:text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
              ฿{costSummary.revenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/10 p-2.5 sm:p-3">
            <p className="text-[10px] uppercase tracking-wider text-rose-600/70 dark:text-rose-400/70 font-semibold">
              {locale === 'th' ? 'ต้นทุน' : 'Cost'}
            </p>
            <p className="text-lg sm:text-xl font-bold text-rose-700 dark:text-rose-300 mt-1">
              ฿{costSummary.totalClaimed.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </p>
            {costSummary.totalPending > 0 && (
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {locale === 'th' ? 'รอจ่าย' : 'pending'} ฿{costSummary.totalPending.toLocaleString()}
              </p>
            )}
          </div>
          {(() => {
            const profit = costSummary.revenue - costSummary.totalClaimed
            const positive = profit >= 0
            return (
              <div className={`rounded-lg border p-2.5 sm:p-3 ${positive
                ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-100/50 dark:bg-emerald-950/20'
                : 'border-rose-300 dark:border-rose-700 bg-rose-100/50 dark:bg-rose-950/20'
              }`}>
                <p className={`text-[10px] uppercase tracking-wider font-semibold ${positive
                  ? 'text-emerald-700/70 dark:text-emerald-300/70'
                  : 'text-rose-700/70 dark:text-rose-300/70'
                }`}>
                  {locale === 'th' ? 'กำไรขั้นต้น' : 'Gross Profit'}
                </p>
                <p className={`text-lg sm:text-xl font-bold mt-1 ${positive
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-rose-700 dark:text-rose-300'
                }`}>
                  {positive ? '' : '−'}฿{Math.abs(profit).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </p>
                {costSummary.revenue > 0 && (
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {((profit / costSummary.revenue) * 100).toFixed(1)}%
                  </p>
                )}
              </div>
            )
          })()}
        </div>
  
        {/* Per-event breakdown — cost (claims) per linked event. Revenue is
            single-sourced at the lead level, so events show cost only. */}
        {costSummary.byEvent.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1.5">
              {locale === 'th' ? 'แยกตามอีเวนต์' : 'By Event'}
            </p>
            <div className="space-y-1.5">
              {costSummary.byEvent.map(ev => {
                const phaseCfg = EVENT_PHASES.find(p => p.value === ev.phase)
                const pct = costSummary.totalClaimed > 0 ? (ev.amount / costSummary.totalClaimed) * 100 : 0
                return (
                  <Link
                    key={ev.eventId}
                    href={`/costs/events/${ev.eventId}`}
                    className="block px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 hover:border-rose-300 hover:bg-rose-50/30 dark:hover:bg-rose-950/10 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        {phaseCfg && <span className="text-xs shrink-0">{phaseCfg.icon}</span>}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{ev.name}</p>
                          <p className="text-[10px] text-zinc-400">
                            {ev.date ? new Date(ev.date).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB') : '—'}
                            {ev.count > 0
                              ? ` • ${ev.count} ${locale === 'th' ? 'ใบเบิก' : 'claims'}`
                              : ` • ${locale === 'th' ? 'ยังไม่มีเบิก' : 'no claims'}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">
                          ฿{ev.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </p>
                        {ev.pending > 0 && (
                          <p className="text-[10px] text-zinc-500">
                            {locale === 'th' ? 'รอจ่าย' : 'pending'} ฿{ev.pending.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    {/* Share of total cost */}
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-rose-400/80 dark:bg-rose-500/80 transition-all duration-500"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400 w-11 text-right shrink-0">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
  
        {/* Phase breakdown */}
        {Object.keys(costSummary.byPhase).length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1.5">
              {locale === 'th' ? 'แยกตาม Phase' : 'By Phase'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[...EVENT_PHASES, { value: 'unphased', labelTh: 'ไม่ระบุ', labelEn: 'Unphased', color: 'zinc', icon: '•' }]
                .filter(p => costSummary.byPhase[p.value])
                .map(p => {
                  const data = costSummary.byPhase[p.value]
                  return (
                    <div key={p.value} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                      <span className="text-xs">{p.icon}</span>
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {locale === 'th' ? p.labelTh : p.labelEn}
                      </span>
                      <span className="text-xs text-zinc-400">×{data.count}</span>
                      <span className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">
                        ฿{data.amount.toLocaleString()}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
  
        {/* Status breakdown */}
        {Object.keys(costSummary.byStatus).length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1.5">
              {locale === 'th' ? 'แยกตามสถานะใบเบิก' : 'By Status'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(costSummary.byStatus)
                .sort((a, b) => b[1].amount - a[1].amount)
                .map(([statusKey, data]) => {
                  const color = getClaimStatusColor(statusKey)
                  return (
                    <div
                      key={statusKey}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs"
                      style={{ borderColor: `${color}40`, backgroundColor: `${color}10` }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="font-medium" style={{ color }}>
                        {getClaimStatusLabel(statusKey, locale === 'th' ? 'th' : 'en')}
                      </span>
                      <span className="text-zinc-400">×{data.count}</span>
                      <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                        ฿{data.amount.toLocaleString()}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
