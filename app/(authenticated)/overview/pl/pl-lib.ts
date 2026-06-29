// ============================================================================
// P&L pure helpers — ใช้ร่วมกันระหว่าง dashboard (pl-summary) และหน้า detail ราย period
// ไม่มี 'use client' / ไม่ import next|supabase → import ได้ทั้ง server และ client
//
// แยกฐานภาษีชัดเจน: ฐานก่อน VAT / VAT 7% / WHT / สุทธิ. รายรับ = CRM Success+accepted,
// รายจ่าย = expense_claims ทั้งหมด (ตัด rejected/cancelled). สูตรภาษีตรงกับ finance/overview.
// ============================================================================

export interface PLLead {
  id: string; status: string | null; customer_name: string | null
  confirmed_price: number | null; quoted_price: number | null
  vat_mode: string | null; wht_rate: number | null
  event_date: string | null; created_at: string | null
  deposit: number | null; assigned_sales: string[] | null
}
// งวดชำระจริง อยู่ในตาราง crm_lead_installments (ไม่ใช่คอลัมน์ใน crm_leads)
export interface PLInstallment { lead_id: string; amount: number | null; is_paid: boolean | null; due_date: string | null; paid_date: string | null }
export interface PLCostItem { job_event_id: string; amount: number | null }
export interface PLClaim {
  id: string; job_event_id: string | null
  claim_type: string | null; category: string | null
  amount: number | null; actual_spent_amount: number | null
  status: string | null; vat_mode: string | null; withholding_tax_rate: number | null
  expense_date: string | null; created_at: string | null
}

export interface Ladder { base: number; vat: number; wht: number; net: number; gross: number; count: number }
// href = ลิงก์ไปต้นทาง (รายรับ → CRM lead /crm/[id], รายจ่าย → ใบเบิก /finance/[id]); linkLabel ใช้แสดง tooltip
// paid/outstanding = เงินที่เก็บมาแล้ว (มัดจำ+งวดที่จ่าย) และยอดคงค้าง — มีค่าเฉพาะรายรับ (รายจ่าย = 0)
export interface LineItem { name: string; meta: string; tag: string; href: string; linkLabel: string; gross: number; base: number; vat: number; wht: number; net: number; paid: number; outstanding: number }

export const REV_STATUSES = new Set(['success', 'accepted'])
export const CLAIM_TYPE_LABEL: Record<string, string> = { event: 'งานอีเวนต์', other: 'office/อื่นๆ', advance: 'เงินสดย่อย' }

export const num = (v: unknown) => Number(v || 0)
export const fmt = (n: number) => Math.round(n).toLocaleString('th-TH')
export const fmtSign = (n: number) => `${n < 0 ? '−' : ''}฿${fmt(Math.abs(n))}`

export function calcTax(amount: number, vatMode: string, whtRatePercent: number) {
  let baseAmount = amount
  let vatAmount = 0
  let totalWithVat = amount
  if (vatMode === 'included') { baseAmount = amount / 1.07; vatAmount = amount - baseAmount }
  else if (vatMode === 'excluded') { vatAmount = amount * 0.07; totalWithVat = amount + vatAmount }
  const whtAmount = baseAmount * (whtRatePercent / 100)
  return { baseAmount, vatAmount, totalWithVat, whtAmount, netPayable: totalWithVat - whtAmount }
}
export type Tax = ReturnType<typeof calcTax>

export const newLadder = (): Ladder => ({ base: 0, vat: 0, wht: 0, net: 0, gross: 0, count: 0 })
export function pushLadder(l: Ladder, t: Tax, gross: number) {
  l.base += t.baseAmount; l.vat += t.vatAmount; l.wht += t.whtAmount
  l.net += t.netPayable; l.gross += gross; l.count++
}

export function claimEffective(c: PLClaim): number {
  return c.claim_type === 'advance' && c.status === 'refund_confirmed' && c.actual_spent_amount != null
    ? num(c.actual_spent_amount) : num(c.amount)
}

export const leadDate = (l: PLLead) => l.event_date || l.created_at
export const claimDate = (c: PLClaim) => c.expense_date || c.created_at
export const leadAmount = (l: PLLead) => num(l.confirmed_price) || num(l.quoted_price)
export const isRevLead = (l: PLLead) => REV_STATUSES.has((l.status || '').toLowerCase())

// เงินที่เก็บมาแล้วจริงต่อ lead = มัดจำ + Σ(งวดที่ is_paid) — สูตรเดียวกับ CRM (actions.ts::total_installments_paid)
export function buildPaidByLead(leads: PLLead[], installments: PLInstallment[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of leads) m.set(l.id, num(l.deposit))
  for (const ins of installments) {
    if (!ins.is_paid) continue
    m.set(ins.lead_id, (m.get(ins.lead_id) || 0) + num(ins.amount))
  }
  return m
}

export function revLineItem(l: PLLead, t: Tax, amount: number, paidRaw: number): LineItem {
  const isSuccess = (l.status || '').toLowerCase() === 'success'
  // เป้าเก็บเงิน = ยอดสุทธิหลัง VAT/WHT (ลูกค้าหัก ณ ที่จ่ายแล้วนำส่งเอง ไม่ใช่หนี้ค้าง)
  const paid = Math.min(paidRaw, t.netPayable)
  return {
    name: l.customer_name || '(ไม่ระบุชื่อ)', meta: (leadDate(l) || '').slice(0, 10),
    tag: isSuccess ? 'success' : 'accepted',
    href: `/crm/${l.id}`, linkLabel: 'เปิดดีลใน CRM',
    gross: amount, base: t.baseAmount, vat: t.vatAmount, wht: t.whtAmount, net: t.netPayable,
    paid, outstanding: Math.max(0, t.netPayable - paid),
  }
}
export function expLineItem(c: PLClaim, t: Tax, amount: number): LineItem {
  const d = (claimDate(c) || '').slice(0, 10)
  return {
    name: c.category || CLAIM_TYPE_LABEL[c.claim_type || ''] || c.claim_type || 'รายจ่าย',
    meta: `${CLAIM_TYPE_LABEL[c.claim_type || ''] || c.claim_type || ''} · ${d}`,
    tag: c.claim_type || 'other',
    href: `/finance/${c.id}`, linkLabel: 'เปิดใบเบิก',
    gross: amount, base: t.baseAmount, vat: t.vatAmount, wht: t.whtAmount, net: t.netPayable,
    paid: 0, outstanding: 0,
  }
}

// ============================================================================
// สุขภาพการเงิน — รวม CRM (รายรับ+เงินสด) กับ ใบเบิก (ต้นทุน) ในมุมเดียว
// ต้นทุนใช้ "ใบเบิกจริง" เป็นฐาน (เงินออกจริง, reconcile กับฝั่งรายจ่าย, ไม่ double-count):
//   - direct = ใบเบิกที่ผูก event ของดีลรายรับ (ต้นทุนตรงของงาน)
//   - overhead = ใบเบิกที่เหลือ (office/ลอย หรือผูกงานที่ไม่ใช่ดีลรายรับ)
// กำไรขั้นต้น = รายรับ(ฐาน) − direct ; กำไรดำเนินงาน = กำไรขั้นต้น − overhead
// ============================================================================

export interface PLJobEvent { id: string; linked_lead_id: string | null }

export interface DealPL {
  leadId: string; name: string; status: string
  revenueBase: number; cost: number; profit: number; margin: number
  gross: number; receivable: number; paid: number; outstanding: number; hasCost: boolean
  planned: number; variance: number; hasPlan: boolean // planned = job_cost_items, variance = actual − planned
}
export interface HealthFlag { severity: 'alert' | 'warning' | 'positive'; text: string }
export interface Health {
  revBase: number; revVat: number; revWht: number; revNet: number
  directCost: number; overhead: number; totalCost: number
  grossProfit: number; operatingProfit: number; grossMargin: number; opMargin: number
  bookedGross: number; collectible: number; cashCollected: number; ar: number; cashRate: number
  dealCount: number; dealsWithCost: number; revWithCostPct: number; overheadRatio: number
  deals: DealPL[]; flags: HealthFlag[]
}

export function buildHealth(
  leads: PLLead[], claims: PLClaim[], installments: PLInstallment[],
  events: PLJobEvent[], costItems: PLCostItem[], inRange: (d: string | null) => boolean,
): Health {
  const paidByLead = buildPaidByLead(leads, installments)
  const revLeadIds = new Set(leads.filter(isRevLead).map((l) => l.id))
  const eventLead = new Map<string, string>()
  for (const e of events) if (e.linked_lead_id) eventLead.set(e.id, e.linked_lead_id)
  // ต้นทุนประเมิน (job_cost_items) รวมต่อ lead ผ่าน event ที่ผูกดีลรายรับ
  const plannedByLead = new Map<string, number>()
  for (const it of costItems) {
    const leadId = eventLead.get(it.job_event_id)
    if (leadId && revLeadIds.has(leadId)) plannedByLead.set(leadId, (plannedByLead.get(leadId) || 0) + num(it.amount))
  }

  const rev = newLadder()
  const dealMap = new Map<string, DealPL>()
  let bookedGross = 0, collectible = 0, cashCollected = 0
  for (const l of leads) {
    if (!isRevLead(l)) continue
    const d = leadDate(l); if (!inRange(d)) continue
    const amount = leadAmount(l); if (amount <= 0) continue
    const t = calcTax(amount, l.vat_mode || 'none', num(l.wht_rate))
    pushLadder(rev, t, amount)
    // ยอดที่ต้องเก็บจากลูกค้า = สุทธิหลัง VAT/WHT (ลูกค้าหัก ณ ที่จ่ายแล้วนำส่งเอง)
    const receivable = t.netPayable
    const paid = Math.min(paidByLead.get(l.id) || 0, receivable)
    bookedGross += amount; collectible += receivable; cashCollected += paid
    const planned = plannedByLead.get(l.id) || 0
    dealMap.set(l.id, {
      leadId: l.id, name: l.customer_name || '(ไม่ระบุชื่อ)', status: (l.status || '').toLowerCase(),
      revenueBase: t.baseAmount, cost: 0, profit: 0, margin: 0,
      gross: amount, receivable, paid, outstanding: Math.max(0, receivable - paid), hasCost: false,
      planned, variance: 0, hasPlan: planned > 0,
    })
  }

  let directCost = 0, overhead = 0
  for (const c of claims) {
    if (c.status === 'rejected' || c.status === 'cancelled') continue
    const d = claimDate(c); if (!inRange(d)) continue
    const amount = claimEffective(c); if (amount <= 0) continue
    const base = calcTax(amount, c.vat_mode || 'none', num(c.withholding_tax_rate)).baseAmount
    const leadId = c.job_event_id ? eventLead.get(c.job_event_id) : undefined
    if (leadId && revLeadIds.has(leadId)) {
      directCost += base
      const deal = dealMap.get(leadId)
      if (deal) { deal.cost += base; deal.hasCost = true }
    } else overhead += base
  }

  for (const deal of dealMap.values()) {
    deal.profit = deal.revenueBase - deal.cost
    deal.margin = deal.revenueBase > 0 ? (deal.profit / deal.revenueBase) * 100 : 0
    deal.variance = deal.cost - deal.planned // >0 = จ่ายจริงเกินที่ประเมิน (overrun)
  }
  const deals = [...dealMap.values()].sort((a, b) => b.revenueBase - a.revenueBase)
  const dealsWithCost = deals.filter((d) => d.hasCost).length
  const revWithCost = deals.filter((d) => d.hasCost).reduce((s, d) => s + d.revenueBase, 0)

  const totalCost = directCost + overhead
  const grossProfit = rev.base - directCost
  const operatingProfit = grossProfit - overhead
  const cashRate = collectible > 0 ? cashCollected / collectible : 0
  const revWithCostPct = rev.base > 0 ? revWithCost / rev.base : 0
  const overheadRatio = totalCost > 0 ? overhead / totalCost : 0

  const flags: HealthFlag[] = []
  if (operatingProfit < 0) flags.push({ severity: 'alert', text: `ขาดทุนดำเนินงาน ฿${fmt(Math.abs(operatingProfit))} ในช่วงนี้` })
  if (cashRate < 0.7 && bookedGross > 0) flags.push({ severity: 'warning', text: `เก็บเงินได้ ${(cashRate * 100).toFixed(0)}% — ลูกหนี้คงค้าง ฿${fmt(bookedGross - cashCollected)}` })
  if (revWithCostPct < 0.8 && rev.base > 0) flags.push({ severity: 'warning', text: `${((1 - revWithCostPct) * 100).toFixed(0)}% ของรายรับยังไม่มีข้อมูลต้นทุน — กำไรอาจสูงเกินจริง` })
  if (overheadRatio > 0.5 && totalCost > 0) flags.push({ severity: 'warning', text: `ค่าใช้จ่าย overhead สูง ${(overheadRatio * 100).toFixed(0)}% ของต้นทุนรวม` })
  const lossDeals = deals.filter((d) => d.hasCost && d.profit < 0).length
  if (lossDeals > 0) flags.push({ severity: 'alert', text: `${lossDeals} ดีลขาดทุน (ต้นทุนเกินรายรับ)` })
  if (operatingProfit >= 0 && cashRate >= 0.7 && flags.length === 0) flags.push({ severity: 'positive', text: `สุขภาพการเงินดี — กำไรดำเนินงาน ฿${fmt(operatingProfit)} (margin ${(rev.base > 0 ? operatingProfit / rev.base * 100 : 0).toFixed(0)}%)` })

  return {
    revBase: rev.base, revVat: rev.vat, revWht: rev.wht, revNet: rev.net,
    directCost, overhead, totalCost,
    grossProfit, operatingProfit,
    grossMargin: rev.base > 0 ? (grossProfit / rev.base) * 100 : 0,
    opMargin: rev.base > 0 ? (operatingProfit / rev.base) * 100 : 0,
    bookedGross, collectible, cashCollected, ar: collectible - cashCollected, cashRate,
    dealCount: deals.length, dealsWithCost, revWithCostPct, overheadRatio,
    deals, flags,
  }
}

// ── สถานะลูกหนี้ (AR) — แยกตามการวางบิล/อายุหนี้ ──
// ส่วนใหญ่ของ AR คือ "ยังไม่แบ่งงวด" (unscheduled) มากกว่าหนี้เลยกำหนด
export interface ArBuckets { unscheduled: number; notDue: number; d0_30: number; d31_60: number; d60plus: number; total: number }
export interface OverdueDeal { leadId: string; name: string; amount: number; daysOverdue: number; dueDate: string }
export interface ArGroup { key: string; name: string; ar: number; overdue: number; count: number }
export interface ArStatus { buckets: ArBuckets; overdue: OverdueDeal[]; bySales: ArGroup[]; byCustomer: ArGroup[] }

export function buildArStatus(leads: PLLead[], installments: PLInstallment[], today: string, salesName?: Map<string, string>): ArStatus {
  const insByLead = new Map<string, PLInstallment[]>()
  for (const i of installments) { const a = insByLead.get(i.lead_id); if (a) a.push(i); else insByLead.set(i.lead_id, [i]) }

  const b = { unscheduled: 0, notDue: 0, d0_30: 0, d31_60: 0, d60plus: 0 }
  const overdue: OverdueDeal[] = []
  const t0 = new Date(today).getTime()
  const salesMap = new Map<string, ArGroup>()
  const custMap = new Map<string, ArGroup>()
  const bump = (m: Map<string, ArGroup>, key: string, name: string, ar: number, od: number) => {
    const g = m.get(key); if (g) { g.ar += ar; g.overdue += od; g.count++ }
    else m.set(key, { key, name, ar, overdue: od, count: 1 })
  }

  for (const l of leads) {
    if (!isRevLead(l)) continue
    const gross = leadAmount(l); if (gross <= 0) continue
    // ยอดที่ต้องเก็บ = สุทธิหลัง VAT/WHT (ตรงกับ "ชำระครบ" ใน CRM) ไม่ใช่ราคาเต็ม
    const net = calcTax(gross, l.vat_mode || 'none', num(l.wht_rate)).netPayable
    const arr = insByLead.get(l.id) || []
    let scheduled = 0, paidSum = num(l.deposit), dealOverdue = 0, maxDays = 0, worstDue = ''
    for (const i of arr) {
      scheduled += num(i.amount)
      if (i.is_paid) { paidSum += num(i.amount); continue }
      const amt = num(i.amount)
      if (!i.due_date) { b.notDue += amt; continue }
      const dd = Math.floor((t0 - new Date(i.due_date).getTime()) / 86_400_000)
      if (dd <= 0) { b.notDue += amt; continue }
      if (dd <= 30) b.d0_30 += amt; else if (dd <= 60) b.d31_60 += amt; else b.d60plus += amt
      dealOverdue += amt
      if (dd > maxDays) { maxDays = dd; worstDue = i.due_date }
    }
    const rem = net - num(l.deposit) - scheduled
    if (rem > 1) b.unscheduled += rem
    if (dealOverdue > 0) overdue.push({ leadId: l.id, name: l.customer_name || '(ไม่ระบุชื่อ)', amount: dealOverdue, daysOverdue: maxDays, dueDate: worstDue })

    // AR คงค้างของดีล = ยอดสุทธิ − เงินที่เก็บแล้ว (มัดจำ+งวดที่จ่าย)
    const leadAr = Math.max(0, net - paidSum)
    if (leadAr > 1) {
      const sid = l.assigned_sales?.[0] || ''
      bump(salesMap, sid || 'none', sid ? (salesName?.get(sid) || sid.slice(0, 6)) : 'ไม่ระบุเซล', leadAr, dealOverdue)
      const cust = l.customer_name || '(ไม่ระบุชื่อ)'
      bump(custMap, cust, cust, leadAr, dealOverdue)
    }
  }
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue)
  const total = b.unscheduled + b.notDue + b.d0_30 + b.d31_60 + b.d60plus
  const byAr = (a: ArGroup, b: ArGroup) => b.ar - a.ar
  return { buckets: { ...b, total }, overdue, bySales: [...salesMap.values()].sort(byAr), byCustomer: [...custMap.values()].sort(byAr) }
}

export type GroupBy = 'day' | 'month' | 'year'
export const groupKey = (d: string, g: GroupBy) => g === 'day' ? d.slice(0, 10) : g === 'month' ? d.slice(0, 7) : d.slice(0, 4)

// ── รวมรายการของ period เดียว (สำหรับหน้า detail) — match = predicate บนวันที่ ──
export interface Slice { base: number; net: number; count: number }
const bumpSlice = (rec: Record<string, Slice>, key: string, t: Tax) => {
  const s = rec[key] || { base: 0, net: 0, count: 0 }
  s.base += t.baseAmount; s.net += t.netPayable; s.count++; rec[key] = s
}
export interface PeriodDetail {
  rev: Ladder; exp: Ladder; expEvent: Ladder; expOffice: Ladder
  credit: LineItem[]; done: LineItem[]; expItems: LineItem[]
  expByType: Record<string, Slice>     // claim_type: event / other / advance
  expByStatus: Record<string, Slice>   // สถานะการจ่าย: paid / pending / approved / ...
  expByCategory: Record<string, Slice> // หมวดค่าใช้จ่าย
}
export function collectPeriod(leads: PLLead[], claims: PLClaim[], match: (d: string) => boolean, paidByLead: Map<string, number>): PeriodDetail {
  const rev = newLadder(), exp = newLadder(), expEvent = newLadder(), expOffice = newLadder()
  const credit: LineItem[] = [], done: LineItem[] = [], expItems: LineItem[] = []
  const expByType: Record<string, Slice> = {}, expByStatus: Record<string, Slice> = {}, expByCategory: Record<string, Slice> = {}

  for (const l of leads) {
    if (!isRevLead(l)) continue
    const d = leadDate(l); if (!d || !match(d)) continue
    const amount = leadAmount(l); if (amount <= 0) continue
    const t = calcTax(amount, l.vat_mode || 'none', num(l.wht_rate))
    pushLadder(rev, t, amount)
    const item = revLineItem(l, t, amount, paidByLead.get(l.id) || 0)
    ;(item.tag === 'success' ? done : credit).push(item)
  }
  for (const c of claims) {
    if (c.status === 'rejected' || c.status === 'cancelled') continue
    const d = claimDate(c); if (!d || !match(d)) continue
    const amount = claimEffective(c); if (amount <= 0) continue
    const t = calcTax(amount, c.vat_mode || 'none', num(c.withholding_tax_rate))
    pushLadder(exp, t, amount)
    pushLadder(c.claim_type === 'event' ? expEvent : expOffice, t, amount)
    bumpSlice(expByType, c.claim_type || 'other', t)
    bumpSlice(expByStatus, c.status || 'unknown', t)
    bumpSlice(expByCategory, c.category || 'ไม่ระบุหมวด', t)
    expItems.push(expLineItem(c, t, amount))
  }
  const byBase = (a: LineItem, b: LineItem) => b.base - a.base
  credit.sort(byBase); done.sort(byBase); expItems.sort(byBase)
  return { rev, exp, expEvent, expOffice, credit, done, expItems, expByType, expByStatus, expByCategory }
}
