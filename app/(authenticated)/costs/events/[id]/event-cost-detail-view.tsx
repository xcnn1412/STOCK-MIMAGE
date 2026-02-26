'use client'

import React, { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  DollarSign, Plus, Trash2, Edit3, CalendarDays, MapPin,
  Check, ArrowLeft, Users, Car, Package, UtensilsCrossed,
  Building2, Megaphone, MoreHorizontal, Receipt, Percent,
  Clock, CheckCircle2, XCircle, Banknote, ExternalLink, RefreshCw
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale } from '@/lib/i18n/context'
import { createCostItem, updateCostItem, deleteCostItem, updateJobEvent } from '../../actions'
import { recreateCostItemFromClaim } from '@/app/(authenticated)/finance/actions'
import { getCategoryColor, getCategoryLabel } from '../../types'
import type { FinanceCategory, CategoryItem, StaffProfile } from '@/app/(authenticated)/finance/settings-actions'
import CostSummaryDashboard from '../../components/cost-summary-dashboard'
import type { BarSegment } from '../../components/cost-summary-dashboard'
import type { JobCostEvent, JobCostItem } from '@/types/database.types'

type JobEventWithItems = JobCostEvent & { job_cost_items: JobCostItem[] }

interface ExpenseClaimRow {
  id: string
  claim_number: string
  title: string
  amount: number
  quantity: number
  total_amount: number
  status: string
  category: string
  expense_date: string
  claim_type: string
  reject_reason: string | null
  submitter?: { id: string; full_name: string } | null
}

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtDec = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return dateStr }
}

const categoryIcons: Record<string, React.ElementType> = {
  staff: Users, travel: Car, equipment: Package, food: UtensilsCrossed,
  venue: Building2, marketing: Megaphone, other: MoreHorizontal,
}

/** คำนวณ VAT + WHT จากยอดก่อน VAT */
function calcTax(amount: number, vatMode: string, whtRate: number) {
  let baseAmount = amount
  let vatAmount = 0

  if (vatMode === 'included') {
    // ราคารวม VAT แล้ว → ถอด VAT ออก
    baseAmount = amount / 1.07
    vatAmount = amount - baseAmount
  } else if (vatMode === 'excluded') {
    // ราคายังไม่รวม VAT → เพิ่ม VAT เข้าไป
    baseAmount = amount
    vatAmount = amount * 0.07
  }
  // 'none' → ไม่มี VAT

  const totalWithVat = baseAmount + vatAmount
  const whtAmount = baseAmount * (whtRate / 100) // หัก ณ ที่จ่าย คิดจากยอดก่อน VAT
  const netPayable = totalWithVat - whtAmount
  return { baseAmount, vatAmount, totalWithVat, whtAmount, netPayable }
}

export default function EventCostDetailView({ jobEvent, expenseClaims = [], categories = [], categoryItems = [], staffProfiles = [] }: { jobEvent: JobEventWithItems; expenseClaims?: ExpenseClaimRow[]; categories?: FinanceCategory[]; categoryItems?: CategoryItem[]; staffProfiles?: StaffProfile[] }) {
  const [isPending, startTransition] = useTransition()
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingRevenue, setEditingRevenue] = useState(false)
  const [revenue, setRevenue] = useState(String(jobEvent.revenue || 0))
  const [revenueVatMode, setRevenueVatMode] = useState(jobEvent.revenue_vat_mode || 'none')
  const [revenueWhtRate, setRevenueWhtRate] = useState(String(jobEvent.revenue_wht_rate || 0))
  const [editingItem, setEditingItem] = useState<JobCostItem | null>(null)
  const router = useRouter()
  const { locale } = useLocale()
  const isEn = locale === 'en'

  const costItems = jobEvent.job_cost_items || []
  const totalCost = costItems.reduce((s, item) => s + (item.amount || 0), 0)

  // Revenue tax calculation
  const revTax = calcTax(Number(revenue) || 0, revenueVatMode, Number(revenueWhtRate) || 0)

  const profit = revTax.netPayable - totalCost
  const isProfitable = profit >= 0
  const profitMargin = revTax.netPayable ? (profit / revTax.netPayable) * 100 : 0

  // สรุป VAT + WHT รวม
  const totalVat = costItems.reduce((s, item) => {
    const vm = item.vat_mode || (item.include_vat ? 'excluded' : 'none')
    const { vatAmount } = calcTax(item.amount, vm, item.withholding_tax_rate)
    return s + vatAmount
  }, 0)
  const totalWht = costItems.reduce((s, item) => {
    const vm = item.vat_mode || (item.include_vat ? 'excluded' : 'none')
    const { whtAmount } = calcTax(item.amount, vm, item.withholding_tax_rate)
    return s + whtAmount
  }, 0)
  const totalNetPayable = costItems.reduce((s, item) => {
    const vm = item.vat_mode || (item.include_vat ? 'excluded' : 'none')
    const { netPayable } = calcTax(item.amount, vm, item.withholding_tax_rate)
    return s + netPayable
  }, 0)

  // Group costs by category
  const costByCategory: Record<string, { items: JobCostItem[]; total: number }> = {}
  costItems.forEach(item => {
    if (!costByCategory[item.category]) costByCategory[item.category] = { items: [], total: 0 }
    costByCategory[item.category].items.push(item)
    costByCategory[item.category].total += item.amount || 0
  })

  const handleAddCost = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    form.set('job_event_id', jobEvent.id)
    startTransition(async () => {
      await createCostItem(form)
      setShowAddForm(false)
      router.refresh()
    })
  }

  const handleUpdateCost = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingItem) return
    const form = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateCostItem(editingItem.id, {
        title: (form.get('title') as string) || null,
        category: form.get('category') as string,
        description: form.get('description') as string,
        amount: Number(form.get('amount') || 0),
        unit_price: Number(form.get('unit_price') || 0),
        unit: (form.get('unit') as string) || 'บาท',
        quantity: Number(form.get('quantity') || 1),
        vat_mode: (form.get('vat_mode') as string) || 'none',
        include_vat: (form.get('vat_mode') as string) !== 'none',
        withholding_tax_rate: Number(form.get('withholding_tax_rate') || 0),
        cost_date: (form.get('cost_date') as string) || null,
        notes: (form.get('notes') as string) || null,
      })
      setEditingItem(null)
      router.refresh()
    })
  }

  const handleDeleteCost = (id: string) => {
    if (!confirm(isEn ? 'Delete this cost item?' : 'ลบรายการนี้?')) return
    startTransition(async () => {
      await deleteCostItem(id)
      router.refresh()
    })
  }

  const handleSaveRevenue = () => {
    startTransition(async () => {
      await updateJobEvent(jobEvent.id, {
        revenue: Number(revenue) || 0,
        revenue_vat_mode: revenueVatMode,
        revenue_wht_rate: Number(revenueWhtRate) || 0,
      })
      setEditingRevenue(false)
      router.refresh()
    })
  }

  const handleToggleStatus = () => {
    const newStatus = jobEvent.status === 'completed' ? 'draft' : 'completed'
    startTransition(async () => {
      await updateJobEvent(jobEvent.id, { status: newStatus })
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative">
        <Link href="/costs/events" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 group">
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          {isEn ? 'Back to Events' : 'กลับไปรายการงาน'}
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0 flex-1">
            <h2 className="text-2xl font-bold tracking-tight leading-tight">{jobEvent.event_name}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {jobEvent.event_date && (
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-muted-foreground">
                  <CalendarDays className="h-3 w-3" />
                  {formatDate(jobEvent.event_date)}
                </span>
              )}
              {jobEvent.event_location && (
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {jobEvent.event_location}
                </span>
              )}
              {jobEvent.seller && (
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  <Users className="h-3 w-3" />
                  {isEn ? 'Seller' : 'ผู้ขาย'}: {jobEvent.seller}
                </span>
              )}
              {jobEvent.staff && (
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  <Users className="h-3 w-3" />
                  {isEn ? 'Staff' : 'ทีมงาน'}: {jobEvent.staff}
                </span>
              )}
            </div>
          </div>
          <Badge
            className="cursor-pointer shrink-0 transition-all hover:scale-105"
            variant={jobEvent.status === 'completed' ? 'default' : 'secondary'}
            onClick={handleToggleStatus}
          >
            {jobEvent.status === 'completed' ? (
              <><Check className="h-3 w-3 mr-1" />{isEn ? 'Completed' : 'เสร็จสิ้น'}</>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                {isEn ? 'Draft' : 'แบบร่าง'}
              </span>
            )}
          </Badge>
        </div>
      </div>


      {/* Revenue Editing Panel (shown when editing) */}
      {editingRevenue && (
        <Card className="border border-zinc-200 dark:border-zinc-700 shadow-sm">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-sm">{isEn ? 'Edit Revenue' : 'แก้ไขราคาขาย'}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSaveRevenue} disabled={isPending}>
                  <Check className="h-4 w-4 mr-1" />{isEn ? 'Save' : 'บันทึก'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  setEditingRevenue(false)
                  setRevenue(String(jobEvent.revenue || 0))
                  setRevenueVatMode(jobEvent.revenue_vat_mode || 'none')
                  setRevenueWhtRate(String(jobEvent.revenue_wht_rate || 0))
                }}>
                  {isEn ? 'Cancel' : 'ยกเลิก'}
                </Button>
              </div>
            </div>
            <div className="space-y-4">
              {/* Revenue Amount */}
              <div className="flex items-center justify-between">
                <Label className="text-sm">{isEn ? 'Revenue Amount' : 'จำนวนเงิน (ราคาขาย)'}</Label>
                <Input
                  className="w-40 h-8 text-right"
                  type="number"
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  min="0"
                  step="1"
                />
              </div>
              {/* VAT Mode */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{isEn ? 'VAT Mode' : 'โหมด VAT'}</Label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" value="none" checked={revenueVatMode === 'none'}
                      onChange={() => setRevenueVatMode('none')} className="accent-zinc-600" />
                    <span className="text-sm">{isEn ? 'No VAT' : 'ไม่มี VAT'}</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" value="included" checked={revenueVatMode === 'included'}
                      onChange={() => setRevenueVatMode('included')} className="accent-zinc-600" />
                    <span className="text-sm">{isEn ? 'VAT Included' : 'รวม VAT 7%'}</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" value="excluded" checked={revenueVatMode === 'excluded'}
                      onChange={() => setRevenueVatMode('excluded')} className="accent-zinc-600" />
                    <span className="text-sm">{isEn ? 'VAT Excluded' : 'ไม่รวม VAT 7%'}</span>
                  </label>
                </div>
              </div>
              {/* WHT Rate */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-zinc-500" />
                  <span className="text-sm">{isEn ? 'Withholding Tax' : 'ภาษีหัก ณ ที่จ่าย'}</span>
                </div>
                <Select value={revenueWhtRate} onValueChange={setRevenueWhtRate}>
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{isEn ? 'None' : 'ไม่หัก'}</SelectItem>
                    <SelectItem value="1">1%</SelectItem>
                    <SelectItem value="2">2%</SelectItem>
                    <SelectItem value="3">3%</SelectItem>
                    <SelectItem value="5">5%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Live Preview */}
              {(revenueVatMode !== 'none' || Number(revenueWhtRate) > 0) && Number(revenue) > 0 && (
                <div className="border-t pt-3 space-y-1.5">
                  {revenueVatMode === 'included' ? (
                    <>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{isEn ? 'Total (VAT included)' : 'ยอดรวม (รวม VAT แล้ว)'}</span>
                        <span className="font-mono">฿{fmtDec(Number(revenue))}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-600 dark:text-zinc-400">{isEn ? 'VAT extracted' : 'ถอด VAT ออก'}</span>
                        <span className="font-mono text-zinc-600 dark:text-zinc-400">฿{fmtDec(revTax.vatAmount)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{isEn ? 'Base amount' : 'ยอดก่อน VAT'}</span>
                        <span className="font-mono">฿{fmtDec(revTax.baseAmount)}</span>
                      </div>
                    </>
                  ) : revenueVatMode === 'excluded' ? (
                    <>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{isEn ? 'Amount before VAT' : 'ยอดก่อน VAT'}</span>
                        <span className="font-mono">฿{fmtDec(Number(revenue))}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-600 dark:text-zinc-400">+ VAT 7%</span>
                        <span className="font-mono text-zinc-600 dark:text-zinc-400">฿{fmtDec(revTax.vatAmount)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{isEn ? 'Total with VAT' : 'ยอดรวม VAT'}</span>
                        <span className="font-mono">฿{fmtDec(revTax.totalWithVat)}</span>
                      </div>
                    </>
                  ) : null}
                  {Number(revenueWhtRate) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-600 dark:text-zinc-400">− {isEn ? 'WHT' : 'หัก ณ ที่จ่าย'} {revenueWhtRate}%</span>
                      <span className="font-mono text-zinc-600 dark:text-zinc-400">−฿{fmtDec(revTax.whtAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold border-t pt-1.5">
                    <span>{isEn ? 'Net Receivable' : 'ยอดรับจริง'}</span>
                    <span className="font-mono">฿{fmtDec(revTax.netPayable)}</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revenue & Cost Summary Dashboard (shared component) */}
      <CostSummaryDashboard
        revenue={jobEvent.revenue || 0}
        totalCost={totalCost}
        revVatAmount={revTax.vatAmount}
        revWhtAmount={revTax.whtAmount}
        revNetReceivable={revTax.netPayable}
        revVatLabel={revenueVatMode === 'included' ? (isEn ? 'Incl.' : 'รวมแล้ว') : (isEn ? 'add' : 'เพิ่ม')}
        costVat={totalVat}
        costWht={totalWht}
        costNetPayable={totalNetPayable}
        barSegments={categories.map(cat => {
          const catCost = costByCategory[cat.value]?.total || 0
          if (!catCost) return null
          return {
            label: isEn ? cat.label : cat.label_th,
            amount: catCost,
            color: cat.color,
            icon: categoryIcons[cat.value] || MoreHorizontal,
          }
        }).filter(Boolean) as BarSegment[]}
        isEn={isEn}
        onRevenueClick={!editingRevenue ? () => setEditingRevenue(true) : undefined}
      />

      {/* Cost Items Table */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-zinc-400" />
              {isEn ? 'Cost Items' : 'รายการค่าใช้จ่าย'}
            </CardTitle>
            <CardDescription>{costItems.length} {isEn ? 'items' : 'รายการ'}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowAddForm(true)} className="shadow-sm">
            <Plus className="h-4 w-4 mr-1" />
            {isEn ? 'Add Cost' : 'เพิ่มรายการ'}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {costItems.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <DollarSign className="h-7 w-7 text-zinc-400" />
              </div>
              <p className="text-sm text-muted-foreground">{isEn ? 'No cost items yet' : 'ยังไม่มีรายการค่าใช้จ่าย'}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{isEn ? 'Click "Add Cost" to start' : 'คลิก "เพิ่มรายการ" เพื่อเริ่มต้น'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderSpacing: '0' }}>
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/50">
                    <th className="text-left py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isEn ? 'Item' : 'รายการ'}</th>
                    <th className="text-right py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{isEn ? 'Unit Price' : 'ราคาต่อหน่วย'}</th>
                    <th className="text-center py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isEn ? 'Unit' : 'หน่วย'}</th>
                    <th className="text-center py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isEn ? 'Qty' : 'จำนวน'}</th>
                    <th className="text-center py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{isEn ? 'WHT' : 'ภาษีหัก ณ ที่จ่าย'}</th>
                    <th className="text-center py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">VAT</th>
                    <th className="text-right py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{isEn ? 'Total' : 'ราคารวม'}</th>
                    <th className="text-left py-2.5 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isEn ? 'Notes' : 'หมายเหตุ'}</th>
                    <th className="py-2.5 px-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => {
                    const group = costByCategory[cat.value]
                    if (!group) return null
                    return (
                      <React.Fragment key={cat.value}>
                        {/* Category Header Row */}
                        <tr>
                          <td colSpan={9} className="pt-4 pb-1.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="w-1 h-4 rounded-full" style={{ backgroundColor: cat.color }} />
                              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: cat.color }}>
                                {isEn ? cat.label : cat.label_th}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {/* Item Rows */}
                        {group.items.map(item => {
                          const vatMode = item.vat_mode || (item.include_vat ? 'excluded' : 'none')
                          const tax = calcTax(item.amount, vatMode, item.withholding_tax_rate)
                          return (
                            <tr key={item.id} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 group">
                              <td className="py-3 px-4 font-medium">{item.description || '-'}</td>
                              <td className="py-3 px-4 text-right font-mono">{fmtDec(item.unit_price || item.amount)}</td>
                              <td className="py-3 px-4 text-center text-muted-foreground">{item.unit || 'บาท'}</td>
                              <td className="py-3 px-4 text-center">{item.quantity || 1}</td>
                              <td className="py-3 px-4 text-center font-mono">
                                {item.withholding_tax_rate > 0 ? (
                                  <span className="flex items-center justify-center gap-3">
                                    <span>{(item.withholding_tax_rate / 100).toFixed(2)}</span>
                                    <span>{fmtDec(tax.whtAmount)}</span>
                                  </span>
                                ) : ''}
                              </td>
                              <td className="py-3 px-4 text-center font-mono">
                                {vatMode !== 'none' ? (
                                  <span className="flex flex-col items-center">
                                    <span className="text-[10px] text-muted-foreground">{vatMode === 'included' ? (isEn ? 'incl.' : 'รวมแล้ว') : (isEn ? 'excl.' : 'เพิ่ม')}</span>
                                    <span>{fmtDec(tax.vatAmount)}</span>
                                  </span>
                                ) : ''}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-semibold">{fmtDec(tax.netPayable)}</td>
                              <td className="py-3 px-4 text-xs max-w-[160px]">
                                {(() => {
                                  if (!item.notes) return <span className="text-muted-foreground">{''}  </span>
                                  // Format: "EXP-202602-001::uuid"
                                  const match = item.notes.match(/^(EXP-\d{6}-\d{3})::(.+)$/)
                                  if (match) {
                                    return (
                                      <a
                                        href={`/finance/${match[2]}`}
                                        className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 hover:underline transition-colors font-medium"
                                      >
                                        <Banknote className="h-3 w-3" />
                                        {match[1]}
                                      </a>
                                    )
                                  }
                                  // Fallback: old format "จากใบเบิก EXP-XXX"
                                  const oldMatch = item.notes.match(/EXP-\d{6}-\d{3}/)
                                  if (oldMatch) {
                                    return (
                                      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                                        <Banknote className="h-3 w-3" />
                                        {oldMatch[0]}
                                      </span>
                                    )
                                  }
                                  return <span className="text-muted-foreground truncate">{item.notes}</span>
                                })()}
                              </td>
                              <td className="py-3 px-2">
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingItem(item)}>
                                    <Edit3 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm" variant="ghost"
                                    className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-600"
                                    onClick={() => handleDeleteCost(item.id)}
                                    disabled={isPending}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 font-semibold bg-zinc-50/80 dark:bg-zinc-900/50">
                    <td className="py-3.5 px-4 text-xs uppercase tracking-wider text-muted-foreground">{isEn ? 'Total' : 'รวม'}</td>
                    <td className="py-3.5 px-4 text-right font-mono text-sm">
                      {fmtDec(costItems.reduce((s, item) => s + (item.unit_price || item.amount || 0), 0))}
                    </td>
                    <td className="py-3.5 px-4"></td>
                    <td className="py-3.5 px-4"></td>
                    <td className="py-3.5 px-4 text-center font-mono text-sm">
                      {totalWht > 0 ? <span className="text-zinc-700 dark:text-zinc-300">{fmtDec(totalWht)}</span> : ''}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-sm">
                      {totalVat > 0 ? <span className="text-zinc-700 dark:text-zinc-300">{fmtDec(totalVat)}</span> : ''}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-sm font-bold">
                      {fmtDec(totalNetPayable)}
                    </td>
                    <td className="py-3.5 px-4"></td>
                    <td className="py-3.5 px-2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expense Claims from Finance (ใบเบิกเงิน) */}
      {expenseClaims.length > 0 && (
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between bg-emerald-50/50 dark:bg-emerald-950/20">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Banknote className="h-4 w-4 text-emerald-500" />
                {isEn ? 'Expense Claims' : 'ใบเบิกเงิน'}
              </CardTitle>
              <CardDescription>
                {expenseClaims.length} {isEn ? 'claims linked to this event' : 'รายการที่ผูกกับอีเวนต์นี้'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {expenseClaims.map(claim => {
                const statusConfig = {
                  pending: { icon: Clock, color: '#f59e0b', label: isEn ? 'Pending' : 'รออนุมัติ', bg: 'bg-amber-50 dark:bg-amber-950/20' },
                  approved: { icon: CheckCircle2, color: '#22c55e', label: isEn ? 'Approved' : 'อนุมัติแล้ว', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
                  rejected: { icon: XCircle, color: '#ef4444', label: isEn ? 'Rejected' : 'ปฏิเสธ', bg: 'bg-red-50 dark:bg-red-950/20' },
                }[claim.status] || { icon: Clock, color: '#6b7280', label: claim.status, bg: '' }
                const StatusIcon = statusConfig.icon
                // เช็คว่ามี cost item ที่สร้างจากใบเบิกนี้หรือยัง
                const hasCostItem = costItems.some(ci => ci.notes?.includes(claim.claim_number))
                return (
                  <div key={claim.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center h-8 w-8 rounded-lg shrink-0" style={{ backgroundColor: `${statusConfig.color}15` }}>
                        <StatusIcon className="h-4 w-4" style={{ color: statusConfig.color }} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-zinc-400">{claim.claim_number}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white" style={{ backgroundColor: statusConfig.color }}>
                            {statusConfig.label}
                          </span>
                          {claim.status === 'approved' && !hasCostItem && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/30">
                              {isEn ? 'No cost item' : 'ยังไม่มีรายการต้นทุน'}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate mt-0.5">{claim.title}</p>
                        <p className="text-xs text-zinc-500">
                          {claim.submitter?.full_name || '—'} • {formatDate(claim.expense_date)}
                        </p>
                        {claim.status === 'rejected' && claim.reject_reason && (
                          <p className="text-xs text-red-500 mt-0.5">❌ {claim.reject_reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      {claim.status === 'approved' && !hasCostItem && (
                        <button
                          onClick={() => {
                            startTransition(async () => {
                              await recreateCostItemFromClaim(claim.id, jobEvent.id)
                              router.refresh()
                            })
                          }}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                          title={isEn ? 'Recreate cost item' : 'สร้างรายการต้นทุนใหม่'}
                        >
                          <RefreshCw className="h-3 w-3" />
                          {isEn ? 'Recreate' : 'สร้างใหม่'}
                        </button>
                      )}
                      <span className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                        ฿{fmt(claim.total_amount || (claim.amount * claim.quantity))}
                      </span>
                      <a
                        href={`/finance/${claim.id}`}
                        className="text-emerald-600 hover:text-emerald-700 transition-colors"
                        title={isEn ? 'View in Finance' : 'ดูในเบิกเงิน'}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Summary */}
            <div className="border-t border-zinc-200 dark:border-zinc-700 px-5 py-3 bg-zinc-50/80 dark:bg-zinc-900/50 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {isEn ? 'Pending claims total' : 'ยอดรววรออนุมัติ'}:
                <span className="font-bold text-amber-600 ml-1">
                  ฿{fmt(expenseClaims.filter(c => c.status === 'pending').reduce((s, c) => s + (c.total_amount || c.amount * c.quantity), 0))}
                </span>
              </span>
              <span className="text-muted-foreground">
                {isEn ? 'Approved total' : 'ยอดอนุมัติแล้ว'}:
                <span className="font-bold text-emerald-600 ml-1">
                  ฿{fmt(expenseClaims.filter(c => c.status === 'approved').reduce((s, c) => s + (c.total_amount || c.amount * c.quantity), 0))}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Cost Dialog */}
      <CostFormDialog
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
        onSubmit={handleAddCost}
        isPending={isPending}
        isEn={isEn}
        title={isEn ? 'Add Cost Item' : 'เพิ่มรายการค่าใช้จ่าย'}
        submitLabel={isEn ? 'Add' : 'เพิ่ม'}
        categories={categories}
        categoryItems={categoryItems}
        staffProfiles={staffProfiles}
      />

      {/* Edit Cost Dialog */}
      {editingItem && (
        <CostFormDialog
          open={true}
          onClose={() => setEditingItem(null)}
          onSubmit={handleUpdateCost}
          isPending={isPending}
          isEn={isEn}
          title={isEn ? 'Edit Cost Item' : 'แก้ไขรายการค่าใช้จ่าย'}
          submitLabel={isEn ? 'Update' : 'อัปเดต'}
          categories={categories}
          categoryItems={categoryItems}
          staffProfiles={staffProfiles}
          defaultValues={{
            title: (editingItem as any).title || '',
            category: editingItem.category,
            description: editingItem.description || '',
            amount: String(editingItem.amount),
            unit_price: String(editingItem.unit_price || editingItem.amount),
            unit: editingItem.unit || 'บาท',
            quantity: String(editingItem.quantity || 1),
            include_vat: editingItem.include_vat,
            vat_mode: editingItem.vat_mode || (editingItem.include_vat ? 'excluded' : 'none'),
            withholding_tax_rate: String(editingItem.withholding_tax_rate || 0),
            cost_date: editingItem.cost_date || '',
            notes: editingItem.notes || '',
          }}
        />
      )}
    </div>
  )
}

// ============================================================================
// Cost Form Dialog (shared for Add/Edit) — พร้อม VAT + WHT
// ============================================================================

function CostFormDialog({
  open, onClose, onSubmit, isPending, isEn, title, submitLabel,
  defaultValues, categories = [], categoryItems = [], staffProfiles = [],
}: {
  open: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isPending: boolean
  isEn: boolean
  title: string
  submitLabel: string
  categories?: FinanceCategory[]
  categoryItems?: CategoryItem[]
  staffProfiles?: StaffProfile[]
  defaultValues?: {
    title?: string
    category?: string
    description?: string
    amount?: string
    unit_price?: string
    unit?: string
    quantity?: string
    vat_mode?: string
    include_vat?: boolean
    withholding_tax_rate?: string
    cost_date?: string
    notes?: string
  }
}) {
  const [selectedCategory, setSelectedCategory] = useState(defaultValues?.category || 'staff')
  const [unitPrice, setUnitPrice] = useState(defaultValues?.unit_price || '0')
  const [quantity, setQuantity] = useState(defaultValues?.quantity || '1')
  const computedAmount = (Number(unitPrice) || 0) * (Number(quantity) || 1)
  const [vatMode, setVatMode] = useState(defaultValues?.vat_mode || (defaultValues?.include_vat ? 'excluded' : 'none'))
  const [whtRate, setWhtRate] = useState(defaultValues?.withholding_tax_rate || '0')

  const whtRateNum = Number(whtRate) || 0
  const tax = calcTax(computedAmount, vatMode, whtRateNum)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Title — หัวข้อการเบิก */}
          <div className="space-y-2">
            <Label>{isEn ? 'Claim Title' : 'หัวข้อการเบิก'} *</Label>
            <Input
              name="title"
              required
              defaultValue={defaultValues?.title}
              placeholder={isEn ? 'e.g. Travel expenses, Equipment cost' : 'เช่น ค่าเดินทางไปงาน, ค่าอุปกรณ์'}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>{isEn ? 'Category' : 'หมวด'} *</Label>
            <Select name="category" value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                      {isEn ? cat.label : cat.label_th}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description — uses detail_source from settings */}
          {(() => {
            const activeCat = categories.find(c => c.value === selectedCategory)
            const source = activeCat?.detail_source || 'none'
            return (
              <div className="space-y-2">
                <Label>{isEn ? 'Description' : 'รายละเอียด'}</Label>
                {source === 'staff' ? (
                  <Select name="description" defaultValue={defaultValues?.description || ''}>
                    <SelectTrigger>
                      <SelectValue placeholder={isEn ? 'Select staff member' : 'เลือกชื่อพนักงาน'} />
                    </SelectTrigger>
                    <SelectContent>
                      {staffProfiles.map(s => (
                        <SelectItem key={s.id} value={s.full_name}>
                          <div className="flex items-center gap-2">
                            <Users className="h-3.5 w-3.5 text-zinc-400" />
                            <span>{s.full_name}</span>
                            {s.role && <span className="text-xs text-muted-foreground">· {s.role}</span>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : source === 'custom' ? (
                  (() => {
                    const activeCat = categories.find(c => c.value === selectedCategory)
                    const items = categoryItems.filter(i => i.category_id === activeCat?.id)
                    return (
                      <Select name="description" defaultValue={defaultValues?.description || ''}>
                        <SelectTrigger>
                          <SelectValue placeholder={isEn ? 'Select...' : 'เลือก...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map(item => (
                            <SelectItem key={item.id} value={item.label}>{item.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  })()
                ) : (
                  <Input name="description" defaultValue={defaultValues?.description} placeholder={isEn ? 'e.g. Staff wages for 3 people' : 'เช่น ค่าสตาฟ 3 คน'} />
                )}
              </div>
            )
          })()}

          {/* Unit Price + Unit + Quantity */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>{isEn ? 'Unit Price (฿)' : 'ราคาต่อหน่วย'} *</Label>
              <Input
                name="unit_price"
                type="number"
                min="0"
                step="0.01"
                required
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>{isEn ? 'Unit' : 'หน่วย'}</Label>
              <Input name="unit" defaultValue={defaultValues?.unit || 'บาท'} placeholder="บาท" />
            </div>
            <div className="space-y-2">
              <Label>{isEn ? 'Quantity' : 'จำนวน'}</Label>
              <Input
                name="quantity"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
              />
            </div>
          </div>

          {/* Computed Amount (hidden) + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{isEn ? 'Total Amount (฿)' : 'ยอดรวม (฿)'}</Label>
              <div className="flex items-center h-9 px-3 rounded-md border bg-zinc-50 dark:bg-zinc-800 font-mono font-semibold">
                ฿{fmtDec(computedAmount)}
              </div>
              <input type="hidden" name="amount" value={computedAmount} />
              <p className="text-[10px] text-muted-foreground">{isEn ? 'Unit Price × Quantity (before VAT)' : 'ราคาต่อหน่วย × จำนวน (ก่อน VAT)'}</p>
            </div>
            <div className="space-y-2">
              <Label>{isEn ? 'Date' : 'วันที่'}</Label>
              <Input name="cost_date" type="date" defaultValue={defaultValues?.cost_date} />
            </div>
          </div>

          {/* VAT + WHT */}
          <div className="border rounded-lg p-3 space-y-3 bg-zinc-50/50 dark:bg-zinc-800/30">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" />
              {isEn ? 'Tax Calculation' : 'คำนวณภาษี'}
            </p>

            {/* VAT Mode Radio */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio" name="vat_mode" value="none"
                    checked={vatMode === 'none'} onChange={() => setVatMode('none')}
                    className="accent-zinc-600"
                  />
                  <span className="text-sm">{isEn ? 'No VAT' : 'ไม่มี VAT'}</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio" name="vat_mode" value="included"
                    checked={vatMode === 'included'} onChange={() => setVatMode('included')}
                    className="accent-orange-600"
                  />
                  <span className="text-sm">{isEn ? 'VAT Included' : 'รวม VAT 7%'}</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio" name="vat_mode" value="excluded"
                    checked={vatMode === 'excluded'} onChange={() => setVatMode('excluded')}
                    className="accent-blue-600"
                  />
                  <span className="text-sm">{isEn ? 'VAT Excluded' : 'ไม่รวม VAT 7%'}</span>
                </label>
              </div>
              {vatMode !== 'none' && (
                <p className="text-[10px] text-muted-foreground pl-1">
                  {vatMode === 'included'
                    ? (isEn ? 'Price already includes VAT — system will extract VAT from the total' : 'ราคารวม VAT แล้ว — ระบบจะถอด VAT ออกจากยอด')
                    : (isEn ? 'Price does not include VAT — system will add VAT on top' : 'ราคายังไม่รวม VAT — ระบบจะเพิ่ม VAT เข้าไป')
                  }
                </p>
              )}
            </div>

            {/* WHT Select */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-purple-500" />
                <span className="text-sm">{isEn ? 'Withholding Tax' : 'ภาษีหัก ณ ที่จ่าย'}</span>
              </div>
              <Select value={whtRate} onValueChange={setWhtRate}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{isEn ? 'None' : 'ไม่หัก'}</SelectItem>
                  <SelectItem value="1">1%</SelectItem>
                  <SelectItem value="2">2%</SelectItem>
                  <SelectItem value="3">3%</SelectItem>
                  <SelectItem value="5">5%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <input type="hidden" name="withholding_tax_rate" value={whtRate} />

            {/* Live Calculation Preview */}
            {(vatMode !== 'none' || whtRateNum > 0) && computedAmount > 0 && (
              <div className="border-t pt-3 mt-2 space-y-1.5">
                {vatMode === 'included' ? (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{isEn ? 'Total (VAT included)' : 'ยอดรวม (รวม VAT แล้ว)'}</span>
                      <span className="font-mono">฿{fmtDec(computedAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-orange-600">{isEn ? 'VAT extracted' : 'ถอด VAT ออก'}</span>
                      <span className="font-mono text-orange-600">฿{fmtDec(tax.vatAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{isEn ? 'Base amount' : 'ยอดก่อน VAT'}</span>
                      <span className="font-mono">฿{fmtDec(tax.baseAmount)}</span>
                    </div>
                  </>
                ) : vatMode === 'excluded' ? (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{isEn ? 'Amount before VAT' : 'ยอดก่อน VAT'}</span>
                      <span className="font-mono">฿{fmtDec(computedAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-blue-600">+ VAT 7%</span>
                      <span className="font-mono text-blue-600">฿{fmtDec(tax.vatAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{isEn ? 'Total with VAT' : 'ยอดรวม VAT'}</span>
                      <span className="font-mono">฿{fmtDec(tax.totalWithVat)}</span>
                    </div>
                  </>
                ) : null}
                {whtRateNum > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-purple-600">− {isEn ? 'Withholding Tax' : 'หัก ณ ที่จ่าย'} {whtRate}%</span>
                    <span className="font-mono text-purple-600">−฿{fmtDec(tax.whtAmount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm font-semibold border-t pt-1.5">
                  <span>{isEn ? 'Net Payable' : 'ยอดจ่ายจริง'}</span>
                  <span className="font-mono">฿{fmtDec(tax.netPayable)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{isEn ? 'Notes' : 'หมายเหตุ'}</Label>
            <Textarea name="notes" rows={2} defaultValue={defaultValues?.notes} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {isEn ? 'Cancel' : 'ยกเลิก'}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (isEn ? 'Saving...' : 'กำลังบันทึก...') : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
