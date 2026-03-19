'use client'

import { useState, useMemo, Fragment, useCallback, useEffect } from 'react'
import {
  LayoutDashboard, Table2, TrendingUp, DollarSign, Users, Calendar,
  MapPin, Download, Search, ChevronDown, ChevronRight, X,
  BarChart3, Zap, UserCheck, Receipt, Percent, ArrowUpRight,
  ArrowDownRight, Target, Banknote, PieChart, Activity, Hash,
  Bot, Loader2, Sparkles, Send, CheckSquare, Square,
  History, Trash2, Eye, Clock, Database, ChevronLeft
} from 'lucide-react'
import {
  saveAiAnalysis, getAiAnalysisHistory, getAiAnalysisDetail, deleteAiAnalysis,
  type AiHistoryRecord
} from './ai-actions'

// ─── Types ──────────────────────────────────────────────────

interface JobEvent {
  id: string; source_event_id: string | null; event_name: string
  event_date: string | null; event_location: string | null
  staff: string | null; revenue: number | null; seller: string | null
  status: string | null
  revenue_vat_mode: string | null; revenue_wht_rate: number | null
}
interface CostItem {
  id: string; job_event_id: string; category: string
  description: string | null; amount: number; title: string | null
}
interface Lead {
  id: string; event_id: string | null; customer_name: string
  confirmed_price: number | null; quoted_price: number | null
  assigned_sales: string[] | null; assigned_graphics: string[] | null
  assigned_staff: string[] | null; package_name: string | null; status: string
}
interface ExpenseClaim {
  id: string; job_event_id: string | null; total_amount: number | null
  status: string; submitted_by: string | null; category: string
}
interface Checkin {
  id: string; event_id: string | null; user_id: string
  checked_in_at: string; checked_out_at: string | null
}
interface Profile { id: string; full_name: string | null; nickname: string | null }
interface EventRecord { id: string; name: string }
interface OverviewData {
  jobEvents: JobEvent[]; costItems: CostItem[]; leads: Lead[]
  expenseClaims: ExpenseClaim[]; checkins: Checkin[]
  profiles: Profile[]; events: EventRecord[]
}

// Cost category labels
const COST_LABELS: Record<string, string> = {
  staff: 'ค่าแรง', travel: 'ค่าเดินทาง', electrical_equipment: 'อุปกรณ์ไฟฟ้า',
  struture: 'โครงสร้าง', service_fee: 'ค่าบริการ', other: 'อื่นๆ',
}
const EXPENSE_STATUS_LABELS: Record<string, string> = {
  pending: 'รอดำเนินการ', approved: 'อนุมัติ', rejected: 'ปฏิเสธ',
  awaiting_payment: 'รอจ่าย', paid: 'จ่ายแล้ว',
}

// ─── Helpers ────────────────────────────────────────────────

function fmt(n: number): string { return n.toLocaleString('th-TH', { maximumFractionDigits: 0 }) }
function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return fmt(n)
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
}
function pct(a: number, b: number) { return b > 0 ? (a / b) * 100 : 0 }

/** คำนวณ VAT/WHT จากราคาและ mode */
function calcRevenueTax(revenue: number, vatMode: string, whtRate: number) {
  let baseAmount = revenue
  let vatAmount = 0
  if (vatMode === 'included') {
    baseAmount = revenue / 1.07
    vatAmount = revenue - baseAmount
  } else if (vatMode === 'excluded') {
    baseAmount = revenue
    vatAmount = revenue * 0.07
  }
  const whtAmount = baseAmount * (whtRate / 100)
  const netReceivable = baseAmount + vatAmount - whtAmount
  return { baseAmount, vatAmount, whtAmount, netReceivable }
}

// Margin band color
function marginBand(m: number): string {
  if (m >= 40) return 'text-emerald-600 dark:text-emerald-400'
  if (m >= 20) return 'text-zinc-700 dark:text-zinc-300'
  if (m >= 0) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-500 dark:text-red-400'
}
function marginBg(m: number): string {
  if (m >= 40) return 'bg-emerald-50 dark:bg-emerald-900/20'
  if (m >= 20) return 'bg-zinc-50 dark:bg-zinc-800/50'
  if (m >= 0) return 'bg-amber-50 dark:bg-amber-900/20'
  return 'bg-red-50 dark:bg-red-900/20'
}

// ─── Component ──────────────────────────────────────────────

export default function OverviewView({ data }: { data: OverviewData }) {
  const [viewMode, setViewMode] = useState<'dashboard' | 'table' | 'ai'>('dashboard')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<string>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // AI Analysis state
  const [aiSections, setAiSections] = useState<Set<string>>(new Set(['financial', 'cost_breakdown', 'per_event', 'sellers', 'expenses', 'checkins']))
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiDateFrom, setAiDateFrom] = useState('')
  const [aiDateTo, setAiDateTo] = useState('')

  // AI History state
  const [showHistory, setShowHistory] = useState(false)
  const [historyList, setHistoryList] = useState<Omit<AiHistoryRecord, 'ai_result' | 'data_snapshot'>[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState<AiHistoryRecord | null>(null)
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false)
  const [currentDataSnapshot, setCurrentDataSnapshot] = useState<Record<string, unknown> | null>(null)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    const res = await getAiAnalysisHistory()
    setHistoryList(res.data)
    setHistoryLoading(false)
  }, [])

  const viewHistoryDetail = useCallback(async (id: string) => {
    setHistoryDetailLoading(true)
    const res = await getAiAnalysisDetail(id)
    if (res.data) setSelectedHistory(res.data)
    setHistoryDetailLoading(false)
  }, [])

  const handleDeleteHistory = useCallback(async (id: string) => {
    if (!confirm('ลบประวัติการวิเคราะห์นี้?')) return
    await deleteAiAnalysis(id)
    setHistoryList(prev => prev.filter(h => h.id !== id))
    if (selectedHistory?.id === id) setSelectedHistory(null)
  }, [selectedHistory])

  useEffect(() => {
    if (showHistory && historyList.length === 0) loadHistory()
  }, [showHistory, historyList.length, loadHistory])

  const toggleAiSection = (s: string) => {
    setAiSections(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>()
    data.profiles.forEach(p => m.set(p.id, p))
    return m
  }, [data.profiles])

  const getName = (id: string) => {
    const p = profileMap.get(id)
    return p?.nickname || p?.full_name || id.slice(0, 6)
  }

  // ─── Build per-event summary ──────────────────────────────
  const eventSummaries = useMemo(() => {
    const costMap = new Map<string, { total: number; byCategory: Record<string, number> }>()
    data.costItems.forEach(c => {
      const prev = costMap.get(c.job_event_id) || { total: 0, byCategory: {} }
      const amt = Number(c.amount || 0)
      prev.total += amt
      prev.byCategory[c.category] = (prev.byCategory[c.category] || 0) + amt
      costMap.set(c.job_event_id, prev)
    })

    const expenseMap = new Map<string, { total: number; count: number; byStatus: Record<string, number>; paid: number }>()
    data.expenseClaims.forEach(e => {
      if (e.job_event_id) {
        const prev = expenseMap.get(e.job_event_id) || { total: 0, count: 0, byStatus: {}, paid: 0 }
        const amt = Number(e.total_amount || 0)
        prev.total += amt; prev.count += 1
        prev.byStatus[e.status] = (prev.byStatus[e.status] || 0) + amt
        if (e.status === 'paid') prev.paid += amt
        expenseMap.set(e.job_event_id, prev)
      }
    })

    const leadMap = new Map<string, Lead>()
    data.leads.forEach(l => { if (l.event_id) leadMap.set(l.event_id, l) })

    const checkinByEvent = new Map<string, { count: number; uniqueUsers: Set<string>; totalHours: number }>()
    data.checkins.forEach(c => {
      if (c.event_id) {
        const prev = checkinByEvent.get(c.event_id) || { count: 0, uniqueUsers: new Set(), totalHours: 0 }
        prev.count += 1
        prev.uniqueUsers.add(c.user_id)
        if (c.checked_out_at) {
          const diff = (new Date(c.checked_out_at).getTime() - new Date(c.checked_in_at).getTime()) / 3_600_000
          if (diff > 0 && diff < 24) prev.totalHours += diff
        }
        checkinByEvent.set(c.event_id, prev)
      }
    })

    const checkinByJobEvent = new Map<string, { count: number; uniqueStaff: number; totalHours: number }>()
    data.jobEvents.forEach(je => {
      if (je.source_event_id) {
        const ci = checkinByEvent.get(je.source_event_id)
        if (ci) checkinByJobEvent.set(je.id, { count: ci.count, uniqueStaff: ci.uniqueUsers.size, totalHours: ci.totalHours })
      }
    })

    return data.jobEvents.map(je => {
      const revenue = Number(je.revenue || 0)
      const costData = costMap.get(je.id) || { total: 0, byCategory: {} }
      const expData = expenseMap.get(je.id) || { total: 0, count: 0, byStatus: {}, paid: 0 }
      const lead = leadMap.get(je.id)
      const ci = checkinByJobEvent.get(je.id) || { count: 0, uniqueStaff: 0, totalHours: 0 }
      const confirmedPrice = Number(lead?.confirmed_price || 0)
      const quotedPrice = Number(lead?.quoted_price || 0)

      // คำนวณ VAT/WHT จาก revenue
      const revVatMode = je.revenue_vat_mode || 'none'
      const revWhtRate = Number(je.revenue_wht_rate || 0)
      const revTax = calcRevenueTax(revenue, revVatMode, revWhtRate)

      const profit = revenue - costData.total
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0

      return {
        id: je.id,
        name: je.event_name,
        date: je.event_date,
        location: je.event_location,
        status: je.status,
        seller: je.seller || '',
        staff: je.staff || '',
        revenue,
        revVatMode,
        revWhtRate,
        revVatAmount: revTax.vatAmount,
        revWhtAmount: revTax.whtAmount,
        revNetReceivable: revTax.netReceivable,
        totalCost: costData.total,
        costByCategory: costData.byCategory,
        profit,
        margin,
        expenseTotal: expData.total,
        expenseCount: expData.count,
        expenseByStatus: expData.byStatus,
        expensePaid: expData.paid,
        checkinCount: ci.count,
        checkinUniqueStaff: ci.uniqueStaff,
        checkinHours: ci.totalHours,
        salesIds: lead?.assigned_sales || [],
        graphicsIds: lead?.assigned_graphics || [],
        staffIds: lead?.assigned_staff || [],
        customerName: lead?.customer_name || '',
        packageName: lead?.package_name || '',
        leadStatus: lead?.status || '',
        confirmedPrice,
        quotedPrice,
        discountPct: quotedPrice > 0 ? ((quotedPrice - confirmedPrice) / quotedPrice) * 100 : 0,
      }
    })
  }, [data])

  // Filters
  const filtered = useMemo(() => {
    let list = eventSummaries
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) || e.location?.toLowerCase().includes(q) ||
        e.seller.toLowerCase().includes(q) || e.customerName.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') list = list.filter(e => e.status === statusFilter)
    // Sort
    list = [...list].sort((a, b) => {
      let va: any, vb: any
      switch (sortKey) {
        case 'name': va = a.name; vb = b.name; break
        case 'date': va = a.date || ''; vb = b.date || ''; break
        case 'revenue': va = a.revenue; vb = b.revenue; break
        case 'cost': va = a.totalCost; vb = b.totalCost; break
        case 'profit': va = a.profit; vb = b.profit; break
        case 'margin': va = a.margin; vb = b.margin; break
        case 'expense': va = a.expenseTotal; vb = b.expenseTotal; break
        case 'checkin': va = a.checkinCount; vb = b.checkinCount; break
        default: va = a.date || ''; vb = b.date || ''
      }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortDir === 'asc' ? va - vb : vb - va
    })
    return list
  }, [eventSummaries, searchQuery, statusFilter, sortKey, sortDir])

  // AI filtered (after main filtered is defined)
  const aiFiltered = useMemo(() => {
    let list = filtered
    if (aiDateFrom) list = list.filter(e => e.date && e.date >= aiDateFrom)
    if (aiDateTo) list = list.filter(e => e.date && e.date <= aiDateTo)
    return list
  }, [filtered, aiDateFrom, aiDateTo])

  const aiTokenEstimate = useMemo(() => {
    const chars = JSON.stringify(aiFiltered).length
    return Math.ceil(chars / 4)
  }, [aiFiltered])

  const runAiAnalysis = useCallback(async () => {
    if (aiFiltered.length === 0) return
    setAiLoading(true)
    setAiError(null)
    setAiResult('')
    setSelectedHistory(null)
    try {
      const eventPayload = aiFiltered.map(e => ({
        name: e.name,
        date: e.date,
        location: e.location,
        seller: e.seller,
        customerName: e.customerName,
        packageName: e.packageName,
        revenue: e.revenue,
        totalCost: e.totalCost,
        costByCategory: e.costByCategory,
        profit: e.profit,
        margin: e.margin,
        expenseTotal: e.expenseTotal,
        expenseCount: e.expenseCount,
        expensePaid: e.expensePaid,
        checkinCount: e.checkinCount,
        checkinUniqueStaff: e.checkinUniqueStaff,
        checkinHours: e.checkinHours,
        graphicsNames: e.graphicsIds.map(id => getName(id)),
        staff: e.staff,
        status: e.status,
      }))

      const payload = {
        events: eventPayload,
        includeSections: Array.from(aiSections),
        customPrompt: aiPrompt,
      }

      // Build data snapshot for history
      const totalRevenue = aiFiltered.reduce((s, e) => s + e.revenue, 0)
      const totalCost = aiFiltered.reduce((s, e) => s + e.totalCost, 0)
      const snapshot = {
        totalRevenue,
        totalCost,
        totalProfit: totalRevenue - totalCost,
        margin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0,
        events: eventPayload.map(e => ({
          name: e.name, date: e.date, seller: e.seller, revenue: e.revenue,
          totalCost: e.totalCost, profit: e.profit, margin: e.margin,
        })),
      }
      setCurrentDataSnapshot(snapshot)

      const res = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'เกิดข้อผิดพลาด' }))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream')

      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.text) {
                fullText += parsed.text
                setAiResult(fullText)
              }
            } catch {
              // skip
            }
          }
        }
      }

      if (!fullText) {
        setAiError('ไม่ได้รับข้อมูลจาก AI')
        setAiResult(null)
      } else {
        // Auto-save to history
        await saveAiAnalysis({
          eventCount: aiFiltered.length,
          dateFrom: aiDateFrom,
          dateTo: aiDateTo,
          sections: Array.from(aiSections),
          customPrompt: aiPrompt,
          dataSnapshot: snapshot,
          aiResult: fullText,
        })
        // Refresh history list if panel is open
        if (showHistory) loadHistory()
      }
    } catch (err: any) {
      setAiError(err.message || 'เกิดข้อผิดพลาด')
      setAiResult(null)
    } finally {
      setAiLoading(false)
    }
  }, [aiFiltered, aiSections, aiPrompt, aiDateFrom, aiDateTo, showHistory, loadHistory])

  // ─── Aggregates ─────────────────────────────────────────
  const totals = useMemo(() => {
    const t = { events: filtered.length, revenue: 0, cost: 0, profit: 0, expenses: 0, expenseCount: 0, expensePaid: 0, checkins: 0, uniqueStaff: 0, checkinHours: 0, completed: 0, costByCategory: {} as Record<string, number>, expenseByStatus: {} as Record<string, number> }
    filtered.forEach(e => {
      t.revenue += e.revenue; t.cost += e.totalCost; t.profit += e.profit
      t.expenses += e.expenseTotal; t.expenseCount += e.expenseCount; t.expensePaid += e.expensePaid
      t.checkins += e.checkinCount; t.uniqueStaff += e.checkinUniqueStaff; t.checkinHours += e.checkinHours
      if (e.status === 'completed') t.completed++
      Object.entries(e.costByCategory).forEach(([k, v]) => { t.costByCategory[k] = (t.costByCategory[k] || 0) + v })
      Object.entries(e.expenseByStatus).forEach(([k, v]) => { t.expenseByStatus[k] = (t.expenseByStatus[k] || 0) + v })
    })
    return t
  }, [filtered])

  const profitMargin = pct(totals.profit, totals.revenue)
  const avgRevenue = totals.events > 0 ? totals.revenue / totals.events : 0
  const avgProfit = totals.events > 0 ? totals.profit / totals.events : 0
  const completionRate = pct(totals.completed, totals.events)
  const expensePayRate = pct(totals.expensePaid, totals.expenses)

  // Top sellers
  const topSellers = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; count: number; profit: number }>()
    filtered.forEach(e => {
      if (e.seller) {
        const prev = map.get(e.seller) || { name: e.seller, revenue: 0, count: 0, profit: 0 }
        prev.revenue += e.revenue; prev.count += 1; prev.profit += e.profit
        map.set(e.seller, prev)
      }
    })
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  }, [filtered])

  // Top graphics
  const topGraphics = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>()
    filtered.forEach(e => {
      e.graphicsIds.forEach(gId => {
        const prev = map.get(gId) || { name: getName(gId), count: 0 }
        prev.count += 1; map.set(gId, prev)
      })
    })
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [filtered])

  // Monthly revenue trend
  const monthlyData = useMemo(() => {
    const map = new Map<string, { revenue: number; cost: number; profit: number; count: number }>()
    filtered.forEach(e => {
      if (e.date) {
        const month = e.date.slice(0, 7)
        const prev = map.get(month) || { revenue: 0, cost: 0, profit: 0, count: 0 }
        prev.revenue += e.revenue; prev.cost += e.totalCost; prev.profit += e.profit; prev.count++
        map.set(month, prev)
      }
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-12)
  }, [filtered])

  // Margin distribution
  const marginDist = useMemo(() => {
    const bands = { negative: 0, low: 0, medium: 0, high: 0 }
    filtered.forEach(e => {
      if (e.margin < 0) bands.negative++
      else if (e.margin < 20) bands.low++
      else if (e.margin < 40) bands.medium++
      else bands.high++
    })
    return bands
  }, [filtered])

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function exportCSV() {
    const header = 'อีเวนต์,วันที่,สถานที่,เซล,ลูกค้า,แพ็คเกจ,ราคาขาย,ต้นทุน,กำไร,Margin%,ค่าแรง,ค่าเดินทาง,อุปกรณ์ไฟฟ้า,โครงสร้าง,ค่าบริการ,อื่นๆ,เบิกจ่ายรวม,ครั้งเบิก,เบิกจ่ายแล้ว,เช็คอิน,พนักงานไม่ซ้ำ,ชม.ทำงาน,กราฟฟิก,สถานะ\n'
    const rows = filtered.map(e => {
      const gfx = e.graphicsIds.map(id => getName(id)).join(';')
      const cc = (k: string) => e.costByCategory[k] || 0
      return [
        `"${e.name}"`, fmtDate(e.date), `"${e.location || ''}"`, `"${e.seller}"`,
        `"${e.customerName}"`, `"${e.packageName}"`,
        e.revenue, e.totalCost, e.profit, e.margin.toFixed(1),
        cc('staff'), cc('travel'), cc('electrical_equipment'), cc('struture'), cc('service_fee'), cc('other'),
        e.expenseTotal, e.expenseCount, e.expensePaid,
        e.checkinCount, e.checkinUniqueStaff, e.checkinHours.toFixed(1),
        `"${gfx}"`, e.status || '',
      ].join(',')
    }).join('\n')
    const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `event-overview-${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const maxMonthly = Math.max(...monthlyData.map(([, v]) => Math.max(v.revenue, v.cost)), 1)
  const SortIcon = ({ k }: { k: string }) => sortKey === k ? (sortDir === 'desc' ? <ChevronDown className="h-3 w-3 inline" /> : <ChevronRight className="h-3 w-3 inline rotate-[-90deg]" />) : null

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Event Overview
          </h1>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">ภาพรวมอีเวนต์ · Performance Analytics · Admin Only</p>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shadow-sm active:scale-[0.98]">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl w-fit">
        {([{key: 'dashboard' as const, icon: LayoutDashboard, label: 'Dashboard'}, {key: 'table' as const, icon: Table2, label: 'ตารางข้อมูล'}, {key: 'ai' as const, icon: Bot, label: 'AI Analysis'}]).map(tab => (
          <button key={tab.key} onClick={() => setViewMode(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              viewMode === tab.key ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700'
            }`}>
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <input type="text" placeholder="ค้นหาอีเวนต์..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-9 pl-8 pr-3 w-[200px] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none">
          <option value="all">ทุกสถานะ</option>
          <option value="draft">Draft</option>
          <option value="completed">Completed</option>
        </select>
        {(searchQuery || statusFilter !== 'all') && (
          <button onClick={() => { setSearchQuery(''); setStatusFilter('all') }}
            className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1">
            <X className="h-3 w-3" /> ล้าง
          </button>
        )}
        <span className="text-xs text-zinc-400 ml-auto">{filtered.length} อีเวนต์</span>
      </div>

      {/* ═══════════════════ DASHBOARD ═══════════════════ */}
      {viewMode === 'dashboard' && (
      <>
        {/* ── Financial KPIs ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={Calendar} label="อีเวนต์ทั้งหมด" value={totals.events.toString()} sub={`เสร็จ ${totals.completed} (${completionRate.toFixed(0)}%)`} />
          <KpiCard icon={TrendingUp} label="รายรับรวม" value={`฿${fmtK(totals.revenue)}`} sub={`เฉลี่ย ฿${fmtK(avgRevenue)}/อีเวนต์`} />
          <KpiCard icon={DollarSign} label="ต้นทุนรวม" value={`฿${fmtK(totals.cost)}`} sub={`${pct(totals.cost, totals.revenue).toFixed(0)}% ของรายรับ`} />
          <KpiCard icon={Zap} label="กำไรสุทธิ" value={`฿${fmtK(totals.profit)}`}
            sub={`Margin ${profitMargin.toFixed(1)}%`}
            valueClass={marginBand(profitMargin)} />
        </div>

        {/* ── Operational KPIs ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={Receipt} label="เบิกจ่ายรวม" value={`฿${fmtK(totals.expenses)}`} sub={`${totals.expenseCount} ครั้ง · จ่ายแล้ว ${expensePayRate.toFixed(0)}%`} />
          <KpiCard icon={UserCheck} label="เช็คอินงาน" value={`${totals.checkins}`} sub={`${totals.uniqueStaff} คนไม่ซ้ำ · ${totals.checkinHours.toFixed(0)} ชม.`} />
          <KpiCard icon={Target} label="เฉลี่ยกำไร/อีเวนต์" value={`฿${fmtK(avgProfit)}`} sub={avgProfit >= 0 ? 'ดี' : 'ขาดทุน'} valueClass={marginBand(pct(avgProfit, avgRevenue))} />
          <KpiCard icon={Percent} label="อัตราส่วน CostRatio" value={`${pct(totals.cost, totals.revenue).toFixed(1)}%`} sub={pct(totals.cost, totals.revenue) < 60 ? 'อยู่ในเกณฑ์ดี' : 'สูงกว่าเกณฑ์'} />
        </div>

        {/* ── Profit Margin Distribution ── */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-3">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
            <PieChart className="h-4 w-4 text-zinc-400" /> Profit Margin Distribution
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'ขาดทุน (<0%)', count: marginDist.negative, color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
              { label: 'ต่ำ (0-20%)', count: marginDist.low, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
              { label: 'กลาง (20-40%)', count: marginDist.medium, color: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300' },
              { label: 'สูง (≥40%)', count: marginDist.high, color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
            ].map(b => (
              <div key={b.label} className={`rounded-xl p-3 ${b.color}`}>
                <div className="text-2xl font-bold font-mono">{b.count}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mt-1 opacity-80">{b.label}</div>
                <div className="text-[10px] opacity-60">{filtered.length > 0 ? pct(b.count, filtered.length).toFixed(0) : 0}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Monthly Revenue vs Cost ── */}
        {monthlyData.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-4">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-4 w-4 text-zinc-400" /> Monthly Trend (Revenue · Cost · Profit)
          </h2>
          <div className="space-y-1">
            {monthlyData.map(([month, v]) => {
              const revW = pct(v.revenue, maxMonthly)
              const costW = pct(v.cost, maxMonthly)
              return (
                <div key={month} className="flex items-center gap-3 group">
                  <span className="text-[10px] font-mono text-zinc-400 w-14 shrink-0">{month}</span>
                  <div className="flex-1 space-y-0.5">
                    <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-zinc-900 dark:bg-zinc-100 rounded-full transition-all duration-300" style={{ width: `${revW}%` }} />
                    </div>
                    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-zinc-400 dark:bg-zinc-500 rounded-full transition-all duration-300" style={{ width: `${costW}%` }} />
                    </div>
                  </div>
                  <div className="text-right w-28 shrink-0">
                    <div className="text-[10px] font-bold text-zinc-900 dark:text-zinc-100 font-mono">฿{fmtK(v.revenue)}</div>
                    <div className="text-[10px] text-zinc-400 font-mono">฿{fmtK(v.cost)} · <span className={marginBand(pct(v.profit, v.revenue))}>{pct(v.profit, v.revenue).toFixed(0)}%</span></div>
                  </div>
                  <span className="text-[10px] text-zinc-400 w-8 shrink-0 text-right font-mono">{v.count}</span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 text-[10px] text-zinc-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-zinc-900 dark:bg-zinc-100" /> รายรับ</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-zinc-400 dark:bg-zinc-500" /> ต้นทุน</span>
            <span className="ml-auto">จำนวนอีเวนต์ (ขวาสุด)</span>
          </div>
        </div>
        )}

        {/* ── Cost Breakdown by Category ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-3">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-zinc-400" /> Cost Breakdown
            </h2>
            <div className="space-y-2">
              {Object.entries(totals.costByCategory).sort(([,a], [,b]) => b - a).map(([cat, val]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 w-24 truncate">{COST_LABELS[cat] || cat}</span>
                  <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-zinc-900 dark:bg-zinc-100 rounded-full transition-all" style={{ width: `${pct(val, totals.cost)}%` }} />
                  </div>
                  <span className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100 w-20 text-right">฿{fmtK(val)}</span>
                  <span className="text-[10px] text-zinc-400 w-10 text-right">{pct(val, totals.cost).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Expense Claim Status ── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-3">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <Receipt className="h-4 w-4 text-zinc-400" /> Expense Claim Status
            </h2>
            <div className="space-y-2">
              {Object.entries(totals.expenseByStatus).sort(([,a], [,b]) => b - a).map(([status, val]) => (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 w-24 truncate">{EXPENSE_STATUS_LABELS[status] || status}</span>
                  <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${status === 'paid' ? 'bg-emerald-500' : status === 'pending' ? 'bg-amber-400' : 'bg-zinc-400'}`} style={{ width: `${pct(val, totals.expenses)}%` }} />
                  </div>
                  <span className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100 w-20 text-right">฿{fmtK(val)}</span>
                  <span className="text-[10px] text-zinc-400 w-10 text-right">{pct(val, totals.expenses).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Sellers & Graphics Performance ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-3">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-zinc-400" /> Sales Performance
            </h2>
            {topSellers.length === 0 ? <p className="text-xs text-zinc-400">ไม่มีข้อมูล</p> : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-zinc-400 uppercase tracking-wider">
                    <th className="py-1 text-left">#</th>
                    <th className="py-1 text-left">เซล</th>
                    <th className="py-1 text-right">อีเวนต์</th>
                    <th className="py-1 text-right">รายรับ</th>
                    <th className="py-1 text-right">กำไร</th>
                    <th className="py-1 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {topSellers.map((s, i) => {
                    const m = pct(s.profit, s.revenue)
                    return (
                      <tr key={s.name}>
                        <td className="py-1.5 text-zinc-400 font-bold">{i + 1}</td>
                        <td className="py-1.5 font-medium text-zinc-900 dark:text-zinc-100">{s.name}</td>
                        <td className="py-1.5 text-right font-mono text-zinc-500">{s.count}</td>
                        <td className="py-1.5 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">฿{fmtK(s.revenue)}</td>
                        <td className="py-1.5 text-right font-mono text-zinc-600 dark:text-zinc-400">฿{fmtK(s.profit)}</td>
                        <td className={`py-1.5 text-right font-mono font-bold ${marginBand(m)}`}>{m.toFixed(0)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-3">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-400" /> Graphic Design Workload
            </h2>
            {topGraphics.length === 0 ? <p className="text-xs text-zinc-400">ไม่มีข้อมูล</p> : (
              <div className="space-y-2">
                {topGraphics.map((g, i) => {
                  const maxG = topGraphics[0].count
                  return (
                    <div key={g.name} className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-zinc-400 w-4 text-right">{i + 1}</span>
                      <div className="h-6 w-6 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center text-[9px] font-bold shrink-0">
                        {g.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">{g.name}</span>
                          <span className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100 ml-2">{g.count} งาน</span>
                        </div>
                        <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-zinc-900 dark:bg-zinc-100 rounded-full" style={{ width: `${pct(g.count, maxG)}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </>
      )}

      {/* ═══════════════════ TABLE ═══════════════════ */}
      {viewMode === 'table' && (
      <>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
                  <th className="px-2 py-3 w-8" />
                  <TH k="name" label="อีเวนต์" left sortKey={sortKey} onClick={toggleSort} />
                  <TH k="date" label="วันที่" sortKey={sortKey} onClick={toggleSort} />
                  <th className="px-2 py-3 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">เซล</th>
                  <th className="px-2 py-3 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">ลูกค้า</th>
                  <TH k="revenue" label="ราคาขาย" right sortKey={sortKey} onClick={toggleSort} />
                  <TH k="cost" label="ต้นทุน" right sortKey={sortKey} onClick={toggleSort} />
                  <th className="px-2 py-3 text-right text-[10px] font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap">หัก ณ ที่จ่าย</th>
                  <th className="px-2 py-3 text-right text-[10px] font-bold text-zinc-400 uppercase tracking-wider">VAT</th>
                  <TH k="profit" label="กำไร" right sortKey={sortKey} onClick={toggleSort} />
                  <TH k="margin" label="MARGIN" right sortKey={sortKey} onClick={toggleSort} />
                  <TH k="expense" label="เบิกจ่าย" right sortKey={sortKey} onClick={toggleSort} />
                  <TH k="checkin" label="เช็คอิน" sortKey={sortKey} onClick={toggleSort} />
                  <th className="px-2 py-3 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filtered.map(e => {
                  const isExp = expandedRows.has(e.id)
                  return (
                    <Fragment key={e.id}> 
                    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer" onClick={() => toggleRow(e.id)}>
                      <td className="px-2 py-2.5">{isExp ? <ChevronDown className="h-3 w-3 text-zinc-400" /> : <ChevronRight className="h-3 w-3 text-zinc-400" />}</td>
                      <td className="px-2 py-2.5 max-w-[180px]">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate text-xs">{e.name}</div>
                        {e.location && <div className="text-[9px] text-zinc-400 truncate">{e.location}</div>}
                      </td>
                      <td className="px-2 py-2.5 text-[11px] text-zinc-500 whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="px-2 py-2.5 text-[11px] text-zinc-700 dark:text-zinc-300">{e.seller || '—'}</td>
                      <td className="px-2 py-2.5 text-[11px] text-zinc-600 dark:text-zinc-400 truncate max-w-[120px]">{e.customerName || '—'}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">฿{fmt(e.revenue)}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-xs text-zinc-500 whitespace-nowrap">฿{fmt(e.totalCost)}</td>
                      <td className="px-2 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                        {e.revWhtRate > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">-฿{fmt(e.revWhtAmount)}</span>
                        ) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                        {e.revVatMode !== 'none' ? (
                          <span className="text-blue-600 dark:text-blue-400">+฿{fmt(e.revVatAmount)}</span>
                        ) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                      </td>
                      <td className={`px-2 py-2.5 text-right font-mono text-xs font-bold whitespace-nowrap ${marginBand(e.margin)}`}>
                        {e.profit >= 0 ? '+' : ''}{fmt(e.profit)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${marginBg(e.margin)} ${marginBand(e.margin)}`}>
                          {e.margin.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right text-xs">
                        {e.expenseCount > 0 ? (
                          <div>
                            <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">฿{fmtK(e.expenseTotal)}</span>
                            <span className="text-[9px] text-zinc-400 ml-0.5">/{e.expenseCount}</span>
                          </div>
                        ) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                      </td>
                      <td className="px-2 py-2.5 text-center text-xs">
                        {e.checkinCount > 0 ? (
                          <div>
                            <span className="font-bold text-zinc-700 dark:text-zinc-300">{e.checkinCount}</span>
                            <div className="text-[9px] text-zinc-400">{e.checkinUniqueStaff}คน · {e.checkinHours.toFixed(0)}ชม.</div>
                          </div>
                        ) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${e.status === 'completed' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                          {e.status === 'completed' ? 'เสร็จ' : 'Draft'}
                        </span>
                      </td>
                    </tr>
                    {/* ── Expanded Detail ── */}
                    {isExp && (
                      <tr key={`${e.id}-d`} className="bg-zinc-50/50 dark:bg-zinc-800/20">
                        <td colSpan={14} className="px-4 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-3">
                            <div><div className="text-[10px] font-bold text-zinc-400 uppercase mb-0.5">แพ็คเกจ</div><div className="text-zinc-900 dark:text-zinc-100 font-medium">{e.packageName || '—'}</div></div>
                            <div><div className="text-[10px] font-bold text-zinc-400 uppercase mb-0.5">CRM Status</div><div className="text-zinc-900 dark:text-zinc-100 font-medium">{e.leadStatus || '—'}</div></div>
                            <div>
                              <div className="text-[10px] font-bold text-zinc-400 uppercase mb-0.5">กราฟฟิก</div>
                              <div className="flex flex-wrap gap-1">
                                {e.graphicsIds.length > 0 ? e.graphicsIds.map(id => (
                                  <span key={id} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">{getName(id)}</span>
                                )) : <span className="text-zinc-400">—</span>}
                              </div>
                            </div>
                            <div><div className="text-[10px] font-bold text-zinc-400 uppercase mb-0.5">พนักงานหน้างาน</div><div className="text-zinc-900 dark:text-zinc-100 font-medium">{e.staff || '—'}</div></div>
                          </div>
                          {/* Cost breakdown */}
                          {Object.keys(e.costByCategory).length > 0 && (
                            <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3 mt-3">
                              <div className="text-[10px] font-bold text-zinc-400 uppercase mb-2">Cost Breakdown</div>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(e.costByCategory).sort(([,a],[,b]) => b - a).map(([cat, val]) => (
                                  <div key={cat} className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-2.5 py-1.5">
                                    <div className="text-[10px] text-zinc-400">{COST_LABELS[cat] || cat}</div>
                                    <div className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100">฿{fmt(val)}</div>
                                    <div className="text-[9px] text-zinc-400">{pct(val, e.totalCost).toFixed(0)}%</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Expense status */}
                          {e.expenseCount > 0 && (
                            <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3 mt-3">
                              <div className="text-[10px] font-bold text-zinc-400 uppercase mb-2">Expense Claims</div>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(e.expenseByStatus).map(([st, val]) => (
                                  <div key={st} className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-2.5 py-1.5">
                                    <div className="text-[10px] text-zinc-400">{EXPENSE_STATUS_LABELS[st] || st}</div>
                                    <div className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100">฿{fmt(val)}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
                {/* Total row */}
                {filtered.length > 0 && (
                  <tr className="bg-zinc-100 dark:bg-zinc-800/60 font-bold border-t-2 border-zinc-300 dark:border-zinc-600">
                    <td className="px-2 py-3" />
                    <td className="px-2 py-3 text-xs text-zinc-900 dark:text-zinc-100">รวมทั้งหมด ({filtered.length})</td>
                    <td className="px-2 py-3" />
                    <td className="px-2 py-3" />
                    <td className="px-2 py-3" />
                    <td className="px-2 py-3 text-right font-mono text-xs text-zinc-900 dark:text-zinc-100">฿{fmt(totals.revenue)}</td>
                    <td className="px-2 py-3 text-right font-mono text-xs text-zinc-500">฿{fmt(totals.cost)}</td>
                    <td className={`px-2 py-3 text-right font-mono text-xs ${marginBand(profitMargin)}`}>{totals.profit >= 0 ? '+' : ''}{fmt(totals.profit)}</td>
                    <td className="px-2 py-3 text-right"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${marginBg(profitMargin)} ${marginBand(profitMargin)}`}>{profitMargin.toFixed(0)}%</span></td>
                    <td className="px-2 py-3 text-right font-mono text-xs text-zinc-700 dark:text-zinc-300">฿{fmtK(totals.expenses)}<span className="text-[9px] text-zinc-400 ml-0.5">/{totals.expenseCount}</span></td>
                    <td className="px-2 py-3 text-center font-mono text-xs text-zinc-700 dark:text-zinc-300">{totals.checkins}</td>
                    <td className="px-2 py-3" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="text-center py-16 text-sm text-zinc-400">ไม่พบข้อมูล</div>}
        </div>
      </>
      )}

      {/* ═══════════════════ AI ANALYSIS ═══════════════════ */}
      {viewMode === 'ai' && (
      <>
        {/* History Toggle */}
        <div className="flex items-center justify-end">
          <button onClick={() => { setShowHistory(h => !h); if (!showHistory) setSelectedHistory(null) }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              showHistory
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}>
            <History className="h-4 w-4" /> ประวัติการวิเคราะห์
            {historyList.length > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-zinc-700 dark:bg-zinc-300 text-white dark:text-zinc-900">{historyList.length}</span>}
          </button>
        </div>

        {/* ── History Panel ── */}
        {showHistory && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                <History className="h-4 w-4 text-zinc-400" /> ประวัติการวิเคราะห์ ({historyList.length})
              </h3>
              <button onClick={loadHistory} disabled={historyLoading}
                className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors">
                {historyLoading ? 'กำลังโหลด...' : 'รีเฟรช'}
              </button>
            </div>
            {historyList.length === 0 ? (
              <p className="text-xs text-zinc-400 py-4 text-center">{historyLoading ? 'กำลังโหลด...' : 'ยังไม่มีประวัติ'}</p>
            ) : (
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {historyList.map(h => (
                  <div key={h.id}
                    className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                      selectedHistory?.id === h.id
                        ? 'bg-zinc-100 dark:bg-zinc-800 ring-1 ring-zinc-300 dark:ring-zinc-600'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                    onClick={() => viewHistoryDetail(h.id)}
                  >
                    <div className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                      <Bot className="h-3.5 w-3.5 text-zinc-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {h.event_count} อีเวนต์
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {h.sections.length} หมวด
                        </span>
                        {h.date_from && (
                          <span className="text-[10px] text-zinc-400">
                            {h.date_from}{h.date_to ? ` → ${h.date_to}` : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(h.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {h.custom_prompt && (
                          <span className="text-[10px] text-zinc-400 truncate max-w-[200px]" title={h.custom_prompt}>
                            "{h.custom_prompt}"
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteHistory(h.id) }}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Selected History Detail ── */}
        {selectedHistory && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedHistory(null)}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
                <ChevronLeft className="h-3.5 w-3.5" /> กลับ
              </button>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                ประวัติ: {new Date(selectedHistory.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </h3>
            </div>

            {/* Data Snapshot */}
            <DataSnapshotPanel snapshot={selectedHistory.data_snapshot} />

            {/* AI Result */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-zinc-400" /> ผลการวิเคราะห์
                </h3>
                <span className="text-[10px] text-zinc-400">{selectedHistory.model_used || 'Gemini'}</span>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none
                prose-headings:text-zinc-900 dark:prose-headings:text-zinc-100
                prose-h2:text-base prose-h2:font-bold prose-h2:mt-6 prose-h2:mb-2
                prose-h3:text-sm prose-h3:font-bold prose-h3:mt-4 prose-h3:mb-1
                prose-p:text-xs prose-p:text-zinc-600 dark:prose-p:text-zinc-400 prose-p:leading-relaxed
                prose-li:text-xs prose-li:text-zinc-600 dark:prose-li:text-zinc-400
                prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100
                prose-table:text-xs
                prose-th:text-[10px] prose-th:font-bold prose-th:text-zinc-400 prose-th:uppercase
                prose-td:py-1 prose-td:text-zinc-600 dark:prose-td:text-zinc-400
                [&_table]:border-collapse [&_th]:border [&_th]:border-zinc-200 [&_th]:dark:border-zinc-700 [&_th]:px-2 [&_th]:py-1
                [&_td]:border [&_td]:border-zinc-200 [&_td]:dark:border-zinc-700 [&_td]:px-2
              ">
                <AiMarkdown content={selectedHistory.ai_result} />
              </div>
            </div>
          </div>
        )}

        {/* ── Main AI Controls (only when NOT viewing history detail) ── */}
        {!selectedHistory && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Controls */}
          <div className="space-y-4">
            {/* Date Range */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="h-4 w-4 text-zinc-400" /> ช่วงเวลา
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-zinc-400 uppercase">จาก</label>
                  <input type="date" value={aiDateFrom} onChange={e => setAiDateFrom(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100" />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-400 uppercase">ถึง</label>
                  <input type="date" value={aiDateTo} onChange={e => setAiDateTo(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100" />
                </div>
              </div>
              {(aiDateFrom || aiDateTo) && (
                <button onClick={() => { setAiDateFrom(''); setAiDateTo('') }}
                  className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors flex items-center gap-1">
                  <X className="h-3 w-3" /> ล้างวันที่
                </button>
              )}
            </div>

            {/* Section Selector */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-zinc-400" /> ข้อมูลที่จะส่งวิเคราะห์
              </h3>
              {[
                { key: 'financial', label: 'ภาพรวมการเงิน', desc: 'รายรับ / ต้นทุน / กำไร / Margin' },
                { key: 'cost_breakdown', label: 'ต้นทุนแยกหมวด', desc: 'ค่าแรง / เดินทาง / อุปกรณ์' },
                { key: 'per_event', label: 'ข้อมูลรายอีเวนต์', desc: 'ทุกอีเวนต์ที่ filter พร้อมรายละเอียด' },
                { key: 'sellers', label: 'ข้อมูลเซล', desc: 'ยอดขาย / กำไร / Margin ต่อเซล' },
                { key: 'expenses', label: 'ข้อมูลเบิกจ่าย', desc: 'จำนวนเงิน / สถานะ / ค้างจ่าย' },
                { key: 'checkins', label: 'ข้อมูลเช็คอิน', desc: 'จำนวนคน / ชั่วโมงรวม' },
                { key: 'graphics', label: 'กราฟฟิก', desc: 'จำนวนงานต่อคน' },
              ].map(item => (
                <button key={item.key} onClick={() => toggleAiSection(item.key)}
                  className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-colors ${
                    aiSections.has(item.key) ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  }`}>
                  {aiSections.has(item.key)
                    ? <CheckSquare className="h-4 w-4 text-zinc-900 dark:text-zinc-100 mt-0.5 shrink-0" />
                    : <Square className="h-4 w-4 text-zinc-300 dark:text-zinc-600 mt-0.5 shrink-0" />}
                  <div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{item.label}</div>
                    <div className="text-[10px] text-zinc-400">{item.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Stats */}
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-xl px-4 py-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">อีเวนต์ที่จะส่ง</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">{aiFiltered.length} อีเวนต์</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">ข้อมูลที่เลือก</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">{aiSections.size} หมวด</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">ประมาณ Token</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">~{aiTokenEstimate.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Right: Prompt + Result */}
          <div className="lg:col-span-2 space-y-4">
            {/* Custom Prompt */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                <Send className="h-4 w-4 text-zinc-400" /> คำถามเพิ่มเติม (ไม่จำเป็น)
              </h3>
              <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                placeholder="เช่น: วิเคราะห์อีเวนต์ที่ขาดทุนและแนะนำวิธีลดต้นทุน...&#10;หรือ: เปรียบเทียบ performance ของเซลแต่ละคน..."
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 resize-none focus:outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-400" />
              <button onClick={runAiAnalysis} disabled={aiLoading || aiFiltered.length === 0 || aiSections.size === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                {aiLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> กำลังวิเคราะห์...</>
                ) : (
                  <><Bot className="h-4 w-4" /> วิเคราะห์ด้วย Gemini ({aiFiltered.length} อีเวนต์)</>
                )}
              </button>
            </div>

            {/* Error */}
            {aiError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl p-4 text-sm text-red-600 dark:text-red-400">
                ⚠️ {aiError}
              </div>
            )}

            {/* Data Snapshot for current analysis */}
            {currentDataSnapshot && aiResult && (
              <DataSnapshotPanel snapshot={currentDataSnapshot} />
            )}

            {/* Result */}
            {aiResult && (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-zinc-400" /> ผลการวิเคราะห์
                  </h3>
                  <span className="text-[10px] text-zinc-400">Powered by Gemini 2.5 Flash · บันทึกอัตโนมัติ ✓</span>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none
                  prose-headings:text-zinc-900 dark:prose-headings:text-zinc-100
                  prose-h2:text-base prose-h2:font-bold prose-h2:mt-6 prose-h2:mb-2
                  prose-h3:text-sm prose-h3:font-bold prose-h3:mt-4 prose-h3:mb-1
                  prose-p:text-xs prose-p:text-zinc-600 dark:prose-p:text-zinc-400 prose-p:leading-relaxed
                  prose-li:text-xs prose-li:text-zinc-600 dark:prose-li:text-zinc-400
                  prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100
                  prose-table:text-xs
                  prose-th:text-[10px] prose-th:font-bold prose-th:text-zinc-400 prose-th:uppercase
                  prose-td:py-1 prose-td:text-zinc-600 dark:prose-td:text-zinc-400
                  [&_table]:border-collapse [&_th]:border [&_th]:border-zinc-200 [&_th]:dark:border-zinc-700 [&_th]:px-2 [&_th]:py-1
                  [&_td]:border [&_td]:border-zinc-200 [&_td]:dark:border-zinc-700 [&_td]:px-2
                ">
                  <AiMarkdown content={aiResult} />
                </div>
              </div>
            )}

            {/* Empty state */}
            {!aiResult && !aiLoading && !aiError && (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-12 text-center">
                <Bot className="h-12 w-12 text-zinc-200 dark:text-zinc-700 mx-auto mb-4" />
                <h3 className="text-sm font-bold text-zinc-400">ยังไม่มีผลวิเคราะห์</h3>
                <p className="text-xs text-zinc-400 mt-1">เลือกข้อมูล กดปุ่ม "วิเคราะห์" เพื่อให้ AI สรุปภาพรวมอีเวนต์</p>
              </div>
            )}
          </div>
        </div>
        )}
      </>
      )}
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, valueClass }: {
  icon: typeof Calendar; label: string; value: string; sub?: string; valueClass?: string
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <Icon className="h-4 w-4 text-zinc-400" />
      </div>
      <div className={`text-xl font-bold tracking-tight font-mono ${valueClass || 'text-zinc-900 dark:text-zinc-100'}`}>{value}</div>
      <p className="text-[10px] text-zinc-400 uppercase tracking-wider mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function TH({ k, label, left, right, sortKey, onClick }: {
  k: string; label: string; left?: boolean; right?: boolean; sortKey: string; onClick: (k: string) => void
}) {
  const active = sortKey === k
  return (
    <th className={`px-2 py-3 text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors select-none ${left ? 'text-left' : right ? 'text-right' : 'text-center'} ${active ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'}`}
      onClick={() => onClick(k)}>
      {label}
    </th>
  )
}

// Simple markdown renderer
function AiMarkdown({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let inTable = false
  let headerRow: string[] = []
  let dataRows: string[][] = []

  const isSeparatorRow = (cells: string[]) => {
    return cells.every(c => /^[\s:|-]*$/.test(c.trim()))
  }

  const flushTable = () => {
    if (headerRow.length > 0 || dataRows.length > 0) {
      elements.push(
        <table key={`t-${elements.length}`}>
          {headerRow.length > 0 && (
            <thead>
              <tr>{headerRow.map((c, i) => <th key={i}>{formatInline(c.trim())}</th>)}</tr>
            </thead>
          )}
          <tbody>
            {dataRows.map((row, ri) => (
              <tr key={ri}>{row.map((c, ci) => <td key={ci}>{formatInline(c.trim())}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )
      headerRow = []
      dataRows = []
    }
    inTable = false
  }

  const formatInline = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      return part
    })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const cells = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
      
      // Skip separator rows (|---|---|---|)
      if (isSeparatorRow(cells)) {
        if (!inTable) inTable = true
        continue
      }

      if (!inTable) {
        // First row = header
        inTable = true
        headerRow = cells
      } else {
        dataRows.push(cells)
      }
      continue
    }
    if (inTable) flushTable()

    if (line.startsWith('## ')) {
      elements.push(<h2 key={i}>{formatInline(line.slice(3))}</h2>)
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i}>{formatInline(line.slice(4))}</h3>)
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={i}>{formatInline(line.slice(2))}</h2>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={i}>{formatInline(line.slice(2))}</li>)
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(<li key={i}>{formatInline(line.replace(/^\d+\.\s/, ''))}</li>)
    } else if (line.trim() === '') {
      // skip
    } else {
      elements.push(<p key={i}>{formatInline(line)}</p>)
    }
  }
  if (inTable) flushTable()

  return <>{elements}</>
}

// Data Snapshot Panel — shows data that was sent to AI
function DataSnapshotPanel({ snapshot }: { snapshot: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)
  const s = snapshot as {
    totalRevenue?: number; totalCost?: number; totalProfit?: number; margin?: number
    events?: { name: string; date: string | null; seller: string; revenue: number; totalCost: number; profit: number; margin: number }[]
  }
  const events = s.events || []

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
      >
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
          <Database className="h-4 w-4 text-zinc-400" /> ข้อมูลที่ส่งให้ AI วิเคราะห์
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-400">{events.length} อีเวนต์</span>
          {expanded
            ? <ChevronDown className="h-4 w-4 text-zinc-400" />
            : <ChevronRight className="h-4 w-4 text-zinc-400" />}
        </div>
      </button>
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-zinc-100 dark:border-zinc-800 pt-4">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'รายรับรวม', value: s.totalRevenue || 0, color: 'text-zinc-900 dark:text-zinc-100' },
              { label: 'ต้นทุนรวม', value: s.totalCost || 0, color: 'text-red-500 dark:text-red-400' },
              { label: 'กำไรรวม', value: s.totalProfit || 0, color: (s.totalProfit || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400' },
              { label: 'Margin %', value: s.margin || 0, color: 'text-zinc-700 dark:text-zinc-300', isFmt: true },
            ].map(item => (
              <div key={item.label} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold mb-0.5">{item.label}</div>
                <div className={`text-sm font-bold font-mono ${item.color}`}>
                  {item.isFmt ? `${item.value.toFixed(1)}%` : `฿${item.value.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`}
                </div>
              </div>
            ))}
          </div>

          {/* Events table */}
          {events.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800">
                    <th className="py-2 text-left">#</th>
                    <th className="py-2 text-left">อีเวนต์</th>
                    <th className="py-2 text-left">วันที่</th>
                    <th className="py-2 text-left">เซล</th>
                    <th className="py-2 text-right">ราคาขาย</th>
                    <th className="py-2 text-right">ต้นทุน</th>
                    <th className="py-2 text-right">กำไร</th>
                    <th className="py-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
                  {events.map((ev, i) => (
                    <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      <td className="py-1.5 text-zinc-400">{i + 1}</td>
                      <td className="py-1.5 font-medium text-zinc-900 dark:text-zinc-100 max-w-[180px] truncate">{ev.name}</td>
                      <td className="py-1.5 text-zinc-500 whitespace-nowrap">
                        {ev.date ? new Date(ev.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                      </td>
                      <td className="py-1.5 text-zinc-600 dark:text-zinc-400">{ev.seller || '—'}</td>
                      <td className="py-1.5 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">฿{ev.revenue.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</td>
                      <td className="py-1.5 text-right font-mono text-zinc-500">฿{ev.totalCost.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</td>
                      <td className={`py-1.5 text-right font-mono font-bold ${ev.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                        {ev.profit >= 0 ? '+' : ''}฿{ev.profit.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                      </td>
                      <td className={`py-1.5 text-right font-mono font-bold ${ev.margin >= 40 ? 'text-emerald-600 dark:text-emerald-400' : ev.margin >= 20 ? 'text-zinc-700 dark:text-zinc-300' : ev.margin >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400'}`}>
                        {ev.margin.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
