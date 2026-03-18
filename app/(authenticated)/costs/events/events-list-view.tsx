'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CalendarDays, MapPin, TrendingUp, TrendingDown, Trash2, Eye,
  Users, UserCheck, RefreshCw, AlertTriangle, DollarSign
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useLocale } from '@/lib/i18n/context'
import { deleteJobEvent, bulkSyncRevenueFromCRM } from '../actions'
import CostSummaryDashboard from '../components/cost-summary-dashboard'
import type { JobCostEvent, JobCostItem } from '@/types/database.types'

type JobEventWithItems = JobCostEvent & { job_cost_items: Pick<JobCostItem, 'id' | 'category' | 'amount' | 'include_vat' | 'vat_mode' | 'withholding_tax_rate'>[] }

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function calcTax(amount: number, vatMode: string, whtRate: number) {
  let baseAmount = amount
  let vatAmount = 0
  if (vatMode === 'included') {
    baseAmount = amount / 1.07
    vatAmount = amount - baseAmount
  } else if (vatMode === 'excluded') {
    baseAmount = amount
    vatAmount = amount * 0.07
  }
  const totalWithVat = baseAmount + vatAmount
  const whtAmount = baseAmount * (whtRate / 100)
  const netPayable = totalWithVat - whtAmount
  return { baseAmount, vatAmount, totalWithVat, whtAmount, netPayable }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric'
    })
  } catch { return dateStr }
}

export default function EventsListView({ jobEvents }: { jobEvents: JobEventWithItems[] }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { locale } = useLocale()
  const isEn = locale === 'en'

  const handleDelete = (id: string, name: string) => {
    if (!confirm(isEn ? `Delete "${name}"? All cost items will be removed.` : `ลบ "${name}"? รายการต้นทุนทั้งหมดจะถูกลบ`)) return
    startTransition(async () => {
      await deleteJobEvent(id)
      router.refresh()
    })
  }

  // Count events missing revenue
  const missingRevenueCount = jobEvents.filter(e => !e.revenue || e.revenue === 0).length
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ syncedCount: number; skippedCount: number } | null>(null)

  const handleBulkSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await bulkSyncRevenueFromCRM()
      if (result.error) {
        alert(result.error)
      } else {
        setSyncResult({ syncedCount: result.syncedCount || 0, skippedCount: result.skippedCount || 0 })
        router.refresh()
      }
    } catch {
      alert('เกิดข้อผิดพลาด')
    } finally {
      setSyncing(false)
    }
  }

  // ── Aggregate data for dashboard ──
  const aggregated = jobEvents.map(event => {
    const items = event.job_cost_items || []
    const totalCost = items.reduce((s, item) => s + (item.amount || 0), 0)

    const revVatMode = event.revenue_vat_mode || 'none'
    const revWhtRate = event.revenue_wht_rate || 0
    const revTax = calcTax(event.revenue || 0, revVatMode, revWhtRate)

    let costVat = 0
    let costWht = 0
    let costNetPayable = 0
    items.forEach(item => {
      const vm = item.vat_mode || (item.include_vat ? 'excluded' : 'none')
      const tax = calcTax(item.amount, vm, item.withholding_tax_rate)
      costVat += tax.vatAmount
      costWht += tax.whtAmount
      costNetPayable += tax.netPayable
    })

    const profit = revTax.netPayable - totalCost
    return { ...event, totalCost, profit, revTax, costVat, costWht, costNetPayable }
  })

  const totalRevenue = aggregated.reduce((s, r) => s + (r.revenue || 0), 0)
  const totalCostAll = aggregated.reduce((s, r) => s + r.totalCost, 0)
  const totalCostVat = aggregated.reduce((s, r) => s + r.costVat, 0)
  const totalCostWht = aggregated.reduce((s, r) => s + r.costWht, 0)
  const totalCostNetPayable = aggregated.reduce((s, r) => s + r.costNetPayable, 0)
  const totalRevVat = aggregated.reduce((s, r) => s + r.revTax.vatAmount, 0)
  const totalRevWht = aggregated.reduce((s, r) => s + r.revTax.whtAmount, 0)
  const totalNetRevenue = aggregated.reduce((s, r) => s + r.revTax.netPayable, 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{isEn ? 'Event Costs' : 'รายการงาน'}</h2>
        <p className="text-sm text-muted-foreground">
          {isEn ? 'All imported events with cost breakdown' : 'รายการอีเวนต์ที่นำเข้าพร้อมสรุปต้นทุน'}
        </p>
      </div>

      {/* ── CRM Sync Banner ── */}
      {missingRevenueCount > 0 && (
        <Card className="border border-amber-200 dark:border-amber-800/50 bg-gradient-to-r from-amber-50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/10 shadow-sm">
          <CardContent className="py-3.5 px-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    {isEn
                      ? `${missingRevenueCount} event${missingRevenueCount > 1 ? 's' : ''} missing revenue`
                      : `${missingRevenueCount} รายการยังไม่มีราคาขาย`}
                  </p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                    {isEn ? 'Sync selling prices from CRM leads to calculate profit accurately' : 'ดึงราคาขายจาก CRM เพื่อคำนวณกำไรให้ถูกต้อง'}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 shrink-0"
                disabled={syncing}
                onClick={handleBulkSync}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing
                  ? (isEn ? 'Syncing...' : 'กำลัง Sync...')
                  : (isEn ? `Sync All from CRM` : `Sync ทั้งหมดจาก CRM`)}
              </Button>
            </div>
            {syncResult && (
              <div className="mt-2.5 flex items-center gap-3 text-xs">
                {syncResult.syncedCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">
                    <DollarSign className="h-3 w-3" /> Sync สำเร็จ {syncResult.syncedCount} รายการ
                  </span>
                )}
                {syncResult.skippedCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">
                    ไม่พบข้อมูลใน CRM {syncResult.skippedCount} รายการ
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Shared Summary Dashboard ── */}
      {jobEvents.length > 0 && (
        <CostSummaryDashboard
          revenue={totalRevenue}
          totalCost={totalCostAll}
          revVatAmount={totalRevVat}
          revWhtAmount={totalRevWht}
          revNetReceivable={totalNetRevenue}
          costVat={totalCostVat}
          costWht={totalCostWht}
          costNetPayable={totalCostNetPayable}
          isEn={isEn}
        />
      )}

      {/* ── Event Cards ── */}
      {jobEvents.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>{isEn ? 'No events yet — go to Import to add events' : 'ยังไม่มีงาน — ไปนำเข้าอีเวนต์ก่อน'}</p>
            <Link href="/costs/import">
              <Button variant="outline" size="sm" className="mt-3">
                {isEn ? 'Go to Import' : 'ไปหน้านำเข้า'}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {aggregated.map((event) => {
            const isProfitable = event.profit >= 0
            const costItemCount = event.job_cost_items?.length || 0

            return (
              <Card key={event.id} className="border border-zinc-200 dark:border-zinc-700 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="flex items-center gap-4 py-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{event.event_name}</p>
                      <Badge variant={event.status === 'completed' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                        {event.status === 'completed' ? (isEn ? 'Done' : 'เสร็จ') : (isEn ? 'Draft' : 'แบบร่าง')}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {event.event_date && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {formatDate(event.event_date)}
                        </span>
                      )}
                      {event.event_location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {event.event_location}
                        </span>
                      )}
                      <span>{costItemCount} {isEn ? 'cost items' : 'รายการต้นทุน'}</span>
                    </div>
                    {(event.staff || event.seller) && (
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-0.5">
                        {event.seller && (
                          <span className="flex items-center gap-1">
                            <UserCheck className="h-3 w-3 text-zinc-400" />
                            <span className="text-zinc-600 dark:text-zinc-400">{isEn ? 'Seller' : 'ผู้ขาย'}:</span> {event.seller}
                          </span>
                        )}
                        {event.staff && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-zinc-400" />
                            <span className="text-zinc-600 dark:text-zinc-400">{isEn ? 'Staff' : 'ทีมงาน'}:</span> {event.staff}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Numbers */}
                  <div className="text-right space-y-0.5 shrink-0">
                    <p className="text-xs text-muted-foreground">{isEn ? 'Revenue' : 'ราคาขาย'}: <span className="font-mono">฿{fmt(event.revenue || 0)}</span></p>
                    <p className="text-xs text-red-500 dark:text-red-400">{isEn ? 'Cost' : 'ต้นทุน'}: <span className="font-mono">฿{fmt(event.totalCost)}</span></p>
                    <p className={`text-sm font-bold flex items-center justify-end gap-1.5 ${isProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                      {isProfitable ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {isProfitable ? '+' : ''}฿{fmt(event.profit)}
                      <span className="text-[10px] font-semibold opacity-70">
                        ({(event.revenue ? (event.profit / event.revenue) * 100 : 0).toFixed(1)}%)
                      </span>
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Link href={`/costs/events/${event.id}`}>
                      <Button size="sm" variant="ghost">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => handleDelete(event.id, event.event_name)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
