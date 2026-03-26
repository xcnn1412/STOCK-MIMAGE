'use client'

import { useState, useTransition, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CalendarDays, MapPin, TrendingUp, TrendingDown, Trash2, Eye,
  Users, UserCheck, RefreshCw, AlertTriangle, DollarSign, Search, X,
  CheckCircle2, CircleAlert, Link as LinkIcon, Filter
} from 'lucide-react'
import { Input } from '@/components/ui/input'
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

type FilterTab = 'all' | 'has_revenue' | 'no_revenue' | 'has_staff' | 'no_staff'

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

  // State
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ syncedCount: number; skippedCount: number } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<FilterTab>('all')

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
  const aggregated = useMemo(() => jobEvents.map(event => {
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
    const hasRevenue = (event.revenue || 0) > 0
    const hasStaffCost = items.some(item => item.category === 'staff')
    const staffCostTotal = items.filter(item => item.category === 'staff').reduce((s, item) => s + (item.amount || 0), 0)
    return { ...event, totalCost, profit, revTax, costVat, costWht, costNetPayable, hasRevenue, hasStaffCost, staffCostTotal }
  }), [jobEvents])

  // Counts for filter tabs
  const hasRevenueCount = aggregated.filter(e => e.hasRevenue).length
  const noRevenueCount = aggregated.filter(e => !e.hasRevenue).length
  const hasStaffCount = aggregated.filter(e => e.hasStaffCost).length
  const noStaffCount = aggregated.filter(e => !e.hasStaffCost).length

  const totalRevenue = aggregated.reduce((s, r) => s + (r.revenue || 0), 0)
  const totalCostAll = aggregated.reduce((s, r) => s + r.totalCost, 0)
  const totalCostVat = aggregated.reduce((s, r) => s + r.costVat, 0)
  const totalCostWht = aggregated.reduce((s, r) => s + r.costWht, 0)
  const totalCostNetPayable = aggregated.reduce((s, r) => s + r.costNetPayable, 0)
  const totalRevVat = aggregated.reduce((s, r) => s + r.revTax.vatAmount, 0)
  const totalRevWht = aggregated.reduce((s, r) => s + r.revTax.whtAmount, 0)
  const totalNetRevenue = aggregated.reduce((s, r) => s + r.revTax.netPayable, 0)

  // Filter + search
  const displayEvents = useMemo(() => {
    const q = searchQuery.toLowerCase()
    let filtered = aggregated

    // Filter by tab
    if (filterTab === 'has_revenue') {
      filtered = filtered.filter(e => e.hasRevenue)
    } else if (filterTab === 'no_revenue') {
      filtered = filtered.filter(e => !e.hasRevenue)
    } else if (filterTab === 'has_staff') {
      filtered = filtered.filter(e => e.hasStaffCost)
    } else if (filterTab === 'no_staff') {
      filtered = filtered.filter(e => !e.hasStaffCost)
    }

    // Search
    if (q) {
      filtered = filtered.filter(e =>
        (e.event_name || '').toLowerCase().includes(q) ||
        (e.event_location || '').toLowerCase().includes(q) ||
        (e.seller || '').toLowerCase().includes(q) ||
        (e.staff || '').toLowerCase().includes(q)
      )
    }

    return filtered
  }, [aggregated, filterTab, searchQuery])

  const filterTabs: { key: FilterTab; label: string; count: number; icon: React.ReactNode; color: string }[] = [
    {
      key: 'all',
      label: isEn ? 'All' : 'ทั้งหมด',
      count: aggregated.length,
      icon: <Filter className="h-3.5 w-3.5" />,
      color: 'text-zinc-600 dark:text-zinc-300',
    },
    {
      key: 'has_revenue',
      label: isEn ? 'Has Revenue' : 'มีราคาขาย',
      count: hasRevenueCount,
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      key: 'no_revenue',
      label: isEn ? 'No Revenue' : 'ยังไม่มีราคาขาย',
      count: noRevenueCount,
      icon: <CircleAlert className="h-3.5 w-3.5" />,
      color: 'text-amber-600 dark:text-amber-400',
    },
    {
      key: 'has_staff',
      label: isEn ? 'Has Staff Cost' : 'มีค่าสตาฟ',
      count: hasStaffCount,
      icon: <Users className="h-3.5 w-3.5" />,
      color: 'text-blue-600 dark:text-blue-400',
    },
    {
      key: 'no_staff',
      label: isEn ? 'No Staff Cost' : 'ยังไม่มีค่าสตาฟ',
      count: noStaffCount,
      icon: <Users className="h-3.5 w-3.5" />,
      color: 'text-rose-600 dark:text-rose-400',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{isEn ? 'Event Costs' : 'รายการงาน'}</h2>
          <p className="text-sm text-muted-foreground">
            {isEn ? 'All imported events with cost breakdown' : 'รายการอีเวนต์ที่นำเข้าพร้อมสรุปต้นทุน'}
          </p>
        </div>
        <div className="relative w-full sm:w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder={isEn ? 'Search event, location, seller...' : 'ค้นหาชื่องาน, สถานที่, ผู้ขาย...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 pr-8 h-9 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
            >
              <X className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />
            </button>
          )}
        </div>
      </div>

      {/* ── CRM Sync Banner ── */}
      {noRevenueCount > 0 && (
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
                      ? `${noRevenueCount} event${noRevenueCount > 1 ? 's' : ''} missing revenue`
                      : `${noRevenueCount} รายการยังไม่มีราคาขาย`}
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

      {/* ── Filter Tabs ── */}
      {jobEvents.length > 0 && (
        <div className="flex items-center gap-1.5 border-b border-zinc-200 dark:border-zinc-700 pb-0">
          {filterTabs.map(tab => {
            const isActive = filterTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={`
                  relative flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium transition-all
                  ${isActive
                    ? `${tab.color} after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full ${
                      tab.key === 'has_revenue' ? 'after:bg-emerald-500' :
                      tab.key === 'no_revenue' ? 'after:bg-amber-500' :
                      tab.key === 'has_staff' ? 'after:bg-blue-500' :
                      tab.key === 'no_staff' ? 'after:bg-rose-500' :
                      'after:bg-zinc-800 dark:after:bg-zinc-200'
                    }`
                    : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
                  }
                `}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span className={`
                  text-[11px] font-semibold px-1.5 py-0.5 rounded-full min-w-[22px] text-center
                  ${isActive
                    ? tab.key === 'has_revenue'
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                      : tab.key === 'no_revenue'
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                        : tab.key === 'has_staff'
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                          : tab.key === 'no_staff'
                            ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                            : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500'
                  }
                `}>
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>
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
      ) : displayEvents.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>{isEn ? 'No matching events' : 'ไม่พบงานที่ตรงกัน'}</p>
            <button onClick={() => { setSearchQuery(''); setFilterTab('all') }} className="mt-2 text-xs text-muted-foreground hover:text-foreground underline transition-colors">
              {isEn ? 'Clear filters' : 'ล้างตัวกรอง'}
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {displayEvents.map((event) => {
            const isProfitable = event.profit >= 0
            const costItemCount = event.job_cost_items?.length || 0
            const hasLinkedLead = !!(event as any).linked_lead_id

            return (
              <Card
                key={event.id}
                className={`
                  border shadow-sm hover:shadow-md transition-all group relative overflow-hidden
                  ${event.hasRevenue
                    ? 'border-zinc-200 dark:border-zinc-700'
                    : 'border-amber-200/80 dark:border-amber-800/40 bg-gradient-to-r from-amber-50/30 to-transparent dark:from-amber-950/10 dark:to-transparent'
                  }
                `}
              >
                {/* Color indicator strip */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${
                  event.hasRevenue
                    ? 'bg-emerald-500 dark:bg-emerald-400'
                    : 'bg-amber-400 dark:bg-amber-500'
                }`} />

                <CardContent className="flex items-center gap-4 py-4 pl-5">
                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{event.event_name}</p>
                      <Badge variant={event.status === 'completed' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                        {event.status === 'completed' ? (isEn ? 'Done' : 'เสร็จ') : (isEn ? 'Draft' : 'แบบร่าง')}
                      </Badge>
                      {/* Revenue status badge */}
                      {event.hasRevenue ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium shrink-0">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          {isEn ? 'Revenue set' : 'มีราคาขาย'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium shrink-0 animate-pulse">
                          <CircleAlert className="h-2.5 w-2.5" />
                          {isEn ? 'No revenue' : 'ยังไม่มีราคาขาย'}
                        </span>
                      )}
                      {/* Staff cost badge */}
                      {event.hasStaffCost ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium shrink-0">
                          <Users className="h-2.5 w-2.5" />
                          {isEn ? 'Staff' : 'ค่าสตาฟ'} ฿{fmt(event.staffCostTotal)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 font-medium shrink-0">
                          <Users className="h-2.5 w-2.5" />
                          {isEn ? 'No staff cost' : 'ยังไม่มีค่าสตาฟ'}
                        </span>
                      )}
                      {/* Linked CRM badge */}
                      {hasLinkedLead && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium shrink-0">
                          <LinkIcon className="h-2.5 w-2.5" />
                          CRM
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {event.event_date && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {formatDate(event.event_date)}
                        </span>
                      )}
                      {event.event_location && (
                        <span className="flex items-center gap-1 truncate max-w-[200px]">
                          <MapPin className="h-3 w-3 shrink-0" />
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
                    {event.hasRevenue ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {isEn ? 'Revenue' : 'ราคาขาย'}: <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">฿{fmt(event.revenue || 0)}</span>
                        </p>
                        <p className="text-xs text-red-500 dark:text-red-400">
                          {isEn ? 'Cost' : 'ต้นทุน'}: <span className="font-mono">฿{fmt(event.totalCost)}</span>
                        </p>
                        <p className={`text-sm font-bold flex items-center justify-end gap-1.5 ${isProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                          {isProfitable ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {isProfitable ? '+' : ''}฿{fmt(event.profit)}
                          <span className="text-[10px] font-semibold opacity-70">
                            ({(event.revenue ? (event.profit / event.revenue) * 100 : 0).toFixed(1)}%)
                          </span>
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                          {isEn ? 'Revenue' : 'ราคาขาย'}: <span className="font-mono">฿0</span>
                        </p>
                        <p className="text-xs text-red-500 dark:text-red-400">
                          {isEn ? 'Cost' : 'ต้นทุน'}: <span className="font-mono">฿{fmt(event.totalCost)}</span>
                        </p>
                        <p className="text-[11px] text-amber-500 dark:text-amber-400 font-medium mt-1">
                          {isEn ? 'Needs CRM sync' : 'รอ sync จาก CRM'}
                        </p>
                      </>
                    )}
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
