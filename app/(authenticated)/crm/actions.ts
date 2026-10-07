'use server'

import { createServiceClient, removeStorageByUrls } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { cache } from 'react'
import { logActivity } from '@/lib/logger'
import { requireAuth } from '@/lib/auth'
import { createNotifications } from '@/lib/notifications'
import { claimEffectiveAmount, summarizeClaims } from '@/app/(authenticated)/costs/lib/crm-cost-grouping'
import { autoCreateJobsFromAcceptedLead } from '@/app/(authenticated)/jobs/actions'
import { readAllRows } from '@/lib/read-all-rows'
import { BOARD_COLUMNS, DAY_MS, bangkokToday, isFirstWon, staleLeadIds, type BoardLead, type CrmLead, type CrmSetting, type StaleRow, type SystemUser } from './types'



async function getSession() {
  const session = await requireAuth()
  return { userId: session?.userId, role: session?.role }
}

// ============================================================================
// System Users — fetch from profiles
// ============================================================================

// 'use server' files may only export async functions, so the cache() loaders stay private.
const loadSystemUsers = cache(async (): Promise<{ data: SystemUser[]; error?: string }> => {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, department')
    .eq('is_approved', true)
    .order('full_name')

  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
})

export async function getSystemUsers() {
  return loadSystemUsers()
}

// ============================================================================
// CRM Settings — CRUD
// ============================================================================

const loadCrmSettings = cache(async (category?: string): Promise<{ data: CrmSetting[]; error?: string }> => {
  const supabase = createServiceClient()
  let query = supabase
    .from('crm_settings')
    .select('*')
    .order('sort_order', { ascending: true })

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query
  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
})

export async function getCrmSettings(category?: string) {
  return loadCrmSettings(category)
}

export async function createCrmSetting(formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const category = formData.get('category') as string
  const value = formData.get('value') as string
  const label_th = formData.get('label_th') as string
  const label_en = formData.get('label_en') as string
  const color = formData.get('color') as string || null
  const price = formData.get('price') ? Number(formData.get('price')) : null
  const description = formData.get('description') as string || null
  const sort_order = formData.get('sort_order') ? Number(formData.get('sort_order')) : 0

  const { error } = await supabase.from('crm_settings').insert({
    category, value, label_th, label_en, color, price, description, sort_order, is_active: true
  })

  if (error) return { error: error.message }

  await logActivity('CREATE_CRM_SETTING', { category, value, label_th })
  revalidatePath('/crm')
  return { success: true }
}

export async function updateCrmSetting(id: string, formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const updates: Record<string, unknown> = {}

  const fields = ['value', 'label_th', 'label_en', 'color', 'description', 'category']
  fields.forEach(f => {
    const v = formData.get(f)
    if (v !== null) updates[f] = v as string
  })
  if (formData.get('price') !== null) updates.price = formData.get('price') ? Number(formData.get('price')) : null
  if (formData.get('sort_order') !== null) updates.sort_order = Number(formData.get('sort_order') || 0)
  if (formData.has('is_active')) updates.is_active = formData.get('is_active') === 'true'

  const { error } = await supabase.from('crm_settings').update(updates).eq('id', id)
  if (error) return { error: error.message }

  await logActivity('UPDATE_CRM_SETTING', { id, changes: Object.keys(updates).join(', ') })
  revalidatePath('/crm')
  return { success: true }
}

/** สถานะ kanban ที่ยังมี lead ใช้อยู่ห้ามลบ/ปิด — การ์ดจะหลุดจากบอร์ด · คืนข้อความ error หรือ null */
async function kanbanStatusInUse(supabase: ReturnType<typeof createServiceClient>, id: string): Promise<string | null> {
  const { data: setting } = await supabase.from('crm_settings').select('category, value').eq('id', id).single()
  if (setting?.category !== 'kanban_status') return null
  const { count, error } = await supabase
    .from('crm_leads').select('id', { count: 'exact', head: true }).eq('status', setting.value)
  if (error) return error.message
  return count ? `ยังมี lead ใช้สถานะนี้อยู่ ${count} ราย — ย้ายสถานะของ lead เหล่านั้นก่อนจึงลบ/ปิดได้` : null
}

export async function deleteCrmSetting(id: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const inUse = await kanbanStatusInUse(supabase, id)
  if (inUse) return { error: inUse }
  const { error } = await supabase.from('crm_settings').delete().eq('id', id)
  if (error) return { error: error.message }

  await logActivity('DELETE_CRM_SETTING', { id })
  revalidatePath('/crm')
  return { success: true }
}

export async function toggleCrmSetting(id: string, is_active: boolean) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  if (!is_active) {
    const inUse = await kanbanStatusInUse(supabase, id)
    if (inUse) return { error: inUse }
  }
  const { error } = await supabase.from('crm_settings').update({ is_active }).eq('id', id)
  if (error) return { error: error.message }

  await logActivity('UPDATE_CRM_SETTING', { id, is_active })
  revalidatePath('/crm')
  return { success: true }
}

// ============================================================================
// CRM Leads — CRUD
// ============================================================================

type LeadFilters = {
  status?: string
  source?: string
  month?: string
  is_returning?: boolean
  search?: string
  includeArchived?: boolean
  /** โหลดเฉพาะงานที่เคลื่อนไหว: updated_at ภายใน days วัน หรือวันงานยังไม่ถึง (ไม่ส่ง = ทุกแถว) */
  window?: { days: number }
  /** true = ทุกคอลัมน์ (ไฟล์ส่งออก) · ค่าเริ่มต้น = BOARD_COLUMNS แบบเบา */
  full?: boolean
}

/** full: true → CrmLead[] (ทุกคอลัมน์) · ไม่งั้น BoardLead[] */
export async function getLeads<F extends LeadFilters = LeadFilters>(filters?: F) {
  return loadLeads(filters) as Promise<{ data: F extends { full: true } ? CrmLead[] : BoardLead[]; error?: string }>
}

async function loadLeads(filters?: LeadFilters): Promise<{ data: BoardLead[]; error?: string }> {
  const supabase = createServiceClient()
  // PostgREST ตัดที่ 1,000 แถวต่อคำขอ → สร้างคำขอใหม่ทุกหน้า เรียง created_at + id ให้คงที่ข้ามหน้า
  const buildWith = (extra?: { col: 'updated_at' | 'event_date'; gte: string }) => (from: number, to: number) => {
    let query = supabase
      .from('crm_leads')
      .select(filters?.full ? '*, crm_lead_installments(amount, is_paid)' : BOARD_COLUMNS)
      .order('created_at', { ascending: false })

    // By default, exclude archived leads
    if (!filters?.includeArchived) {
      query = query.is('archived_at', null)
    }

    if (filters?.status) query = query.eq('status', filters.status)
    if (filters?.source) query = query.eq('lead_source', filters.source)
    if (filters?.is_returning !== undefined) query = query.eq('is_returning', filters.is_returning)
    if (filters?.search) {
      // Sanitize: strip PostgREST special chars to prevent filter manipulation
      const sanitized = filters.search.replace(/[.,()]/g, '').trim()
      if (sanitized) {
        query = query.or(`customer_name.ilike.%${sanitized}%,customer_line.ilike.%${sanitized}%`)
      }
    }
    if (filters?.month) {
      const [year, month] = filters.month.split('-')
      const start = `${year}-${month}-01`
      const endDate = new Date(Number(year), Number(month), 0)
      const end = `${year}-${month}-${String(endDate.getDate()).padStart(2, '0')}`
      query = query.gte('created_at', `${start}T00:00:00`).lte('created_at', `${end}T23:59:59`)
    }
    if (extra) query = query.gte(extra.col, extra.gte)
    return query.order('id').range(from, to)
  }

  // แถวดิบ = คอลัมน์ที่ select + งวดที่ join มา (ยังไม่มี total_installments_paid)
  type RawLead = Omit<BoardLead, 'total_installments_paid'> & {
    crm_lead_installments?: { amount: number | string | null; is_paid: boolean | null }[] | null
  }
  let data: RawLead[]
  if (filters?.window) {
    // ไม่ใช้ .or() — อ่านสองชุด (แตะล่าสุดใน N วัน / วันงานยังไม่ถึง) แล้วรวมตาม id
    const now = Date.now()
    const since = new Date(now - filters.window.days * DAY_MS).toISOString()
    const today = bangkokToday(now)
    const [touched, upcoming] = await Promise.all([
      readAllRows<RawLead>(buildWith({ col: 'updated_at', gte: since })),
      readAllRows<RawLead>(buildWith({ col: 'event_date', gte: today })),
    ])
    const error = touched.error || upcoming.error
    if (error) return { error: error.message, data: [] }
    const byId = new Map<string, RawLead>()
    for (const r of [...touched.rows, ...upcoming.rows]) byId.set(r.id, r)
    data = [...byId.values()].sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  } else {
    const res = await readAllRows<RawLead>(buildWith())
    if (res.error) return { error: res.error.message, data: [] }
    data = res.rows
  }

  // Compute total_installments_paid for each lead
  const enriched = (data || []).map((lead) => {
    const installments = lead.crm_lead_installments || []
    const total_installments_paid = installments
      .filter((i) => i.is_paid)
      .reduce((sum: number, i) => sum + (Number(i.amount) || 0), 0)
    const { crm_lead_installments, ...rest } = lead
    return { ...rest, total_installments_paid }
  })

  return { data: enriched }
}

export async function getArchivedLeads() {
  const supabase = createServiceClient()
  const { rows: data, error } = await readAllRows<CrmLead>((from, to) => supabase
    .from('crm_leads')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
    .order('id')
    .range(from, to))

  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

// ponytail: cache() dedupes per request (crm/[id] calls getLead from generateMetadata + page)
const loadLead = cache(async (id: string) => {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('crm_leads')
    .select('*')
    .eq('id', id)
    .single<CrmLead>()

  if (error) return { error: error.message, data: null }
  return { data }
})

export async function getLead(id: string) {
  return loadLead(id)
}

// Update the phase classifier on a job_cost_events row. Lead detail page allows inline editing.
export async function setJobCostEventPhase(jobEventId: string, phase: string | null) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const allowedPhases = ['setup', 'main', 'teardown', 'delivery', 'other']
  const phaseValue = phase && allowedPhases.includes(phase) ? phase : null

  const supabase = createServiceClient()
  const { data: row, error } = await supabase
    .from('job_cost_events')
    .update({ phase: phaseValue })
    .eq('id', jobEventId)
    .select('linked_lead_id')
    .single()

  if (error) return { error: error.message }
  await logActivity('UPDATE_CRM_EVENT_PHASE', { jobEventId, phase: phaseValue })

  if (row?.linked_lead_id) {
    revalidatePath(`/crm/${row.linked_lead_id}`)
  }
  revalidatePath(`/costs/events/${jobEventId}`)
  return { success: true }
}

// ============================================================================
// Lead Cost Summary — aggregate expense claims across all job_cost_events for a lead
// Revenue is read from crm_leads.confirmed_price (single source of truth at the lead level).
// Cost = sum of expense_claims.amount across all linked job_cost_events,
// excluding rejected/cancelled claims. Advance claims that are refund_confirmed
// use actual_spent_amount when available.
// ============================================================================

export interface LeadEventCost {
  eventId: string
  name: string
  date: string | null
  phase: string | null
  count: number                 // claims on this event (excl. rejected/cancelled)
  amount: number                // total claimed (effective) on this event
  paid: number
  pending: number
}

export interface LeadCostSummary {
  revenue: number
  totalClaimed: number          // claims that count toward cost (excluding rejected/cancelled)
  totalPaid: number             // actually paid out (paid status, plus refund_confirmed using actual_spent_amount)
  totalPending: number          // everything between submit and paid
  claimCount: number
  byPhase: Record<string, { count: number; amount: number }>
  byStatus: Record<string, { count: number; amount: number }>
  byEvent: LeadEventCost[]      // per-event cost breakdown (every linked cost event, incl. zero-claim ones)
}

export async function getLeadCostSummary(leadId: string): Promise<LeadCostSummary> {
  const supabase = createServiceClient()

  // 1. Get revenue from the lead
  const { data: lead } = await supabase
    .from('crm_leads')
    .select('confirmed_price, quoted_price')
    .eq('id', leadId)
    .single()
  const revenue = Number(lead?.confirmed_price || lead?.quoted_price || 0)

  // 2. Get all job_cost_events for this lead, including phase + name/date for per-event breakdown
  const { data: jobEvents } = await supabase
    .from('job_cost_events')
    .select('id, phase, event_name, event_date')
    .eq('linked_lead_id', leadId)

  const jobEventIds = (jobEvents || []).map(e => e.id)
  const phaseByEventId = new Map<string, string | null>(
    (jobEvents || []).map(e => [e.id, e.phase ?? null])
  )

  // Per-event breakdown — initialized from ALL linked cost events so zero-claim events still show.
  const byEventMap = new Map<string, LeadEventCost>()
  for (const e of (jobEvents || [])) {
    byEventMap.set(e.id, {
      eventId: e.id,
      name: e.event_name,
      date: e.event_date ?? null,
      phase: e.phase ?? null,
      count: 0,
      amount: 0,
      paid: 0,
      pending: 0,
    })
  }

  if (jobEventIds.length === 0) {
    return {
      revenue,
      totalClaimed: 0,
      totalPaid: 0,
      totalPending: 0,
      claimCount: 0,
      byPhase: {},
      byStatus: {},
      byEvent: [],
    }
  }

  // 3. Fetch all expense claims for those job_cost_events
  const { data: claims } = await supabase
    .from('expense_claims')
    .select('id, job_event_id, claim_type, status, amount, actual_spent_amount')
    .in('job_event_id', jobEventIds)

  // Totals + byStatus are the shared, costs-module-wide claim aggregation.
  const summary = summarizeClaims(claims || [])

  // byPhase + byEvent need the event join, so they stay local to this action.
  const byPhase: Record<string, { count: number; amount: number }> = {}
  for (const c of (claims || [])) {
    if (c.status === 'rejected' || c.status === 'cancelled') continue
    const effectiveAmount = claimEffectiveAmount(c)
    const phaseKey = (c.job_event_id ? phaseByEventId.get(c.job_event_id) : null) || 'unphased'
    byPhase[phaseKey] = byPhase[phaseKey] || { count: 0, amount: 0 }
    byPhase[phaseKey].count++
    byPhase[phaseKey].amount += effectiveAmount

    const ev = c.job_event_id ? byEventMap.get(c.job_event_id) : undefined
    if (ev) {
      ev.count++
      ev.amount += effectiveAmount
      if (c.status === 'paid' || c.status === 'refund_confirmed') ev.paid += effectiveAmount
      else ev.pending += effectiveAmount
    }
  }

  // Sort: events with the most cost first; zero-claim events fall to the bottom.
  const byEvent = Array.from(byEventMap.values()).sort((a, b) => b.amount - a.amount)

  return {
    revenue,
    totalClaimed: summary.totalClaimed,
    totalPaid: summary.totalPaid,
    totalPending: summary.totalPending,
    claimCount: summary.claimCount,
    byPhase,
    byStatus: summary.byStatus,
    byEvent,
  }
}

// Unified linked event row exposed to the lead detail UI.
// Combines operational events (`events` table) and financial events (`job_cost_events` table),
// merged so a single operational event imported to costs appears once with both ids.
export interface LinkedLeadEvent {
  // Identity — exactly one of these will always be set; both set means the operational event
  // has been imported to costs and we know about both records.
  operationalId: string | null  // events.id
  costId: string | null         // job_cost_events.id

  name: string
  date: string | null
  location: string | null
  status: string | null
  phase: string | null          // only meaningful when costId is set
}

// Fetch ALL events linked to this lead, from BOTH tables, merged.
// 1 lead → N events of any kind (operational-only, cost-only, or both).
export async function getLeadEvents(leadId: string): Promise<{ data: LinkedLeadEvent[]; error?: string }> {
  const supabase = createServiceClient()

  const [opRes, costRes] = await Promise.all([
    supabase
      .from('events')
      .select('id, name, event_date, location, status')
      .eq('crm_lead_id', leadId),
    supabase
      .from('job_cost_events')
      .select('id, event_name, event_date, event_location, status, phase, source_event_id, created_at')
      .eq('linked_lead_id', leadId),
  ])

  if (opRes.error && costRes.error) {
    return { data: [], error: opRes.error.message }
  }

  // Build merged list. Key by operational event id when possible so import-pairs collapse to one row.
  const merged = new Map<string, LinkedLeadEvent>()
  for (const op of (opRes.data || [])) {
    merged.set(`op:${op.id}`, {
      operationalId: op.id,
      costId: null,
      name: op.name,
      date: op.event_date,
      location: op.location,
      status: op.status,
      phase: null,
    })
  }
  for (const c of (costRes.data || [])) {
    const opKey = c.source_event_id ? `op:${c.source_event_id}` : null
    if (opKey && merged.has(opKey)) {
      // Pair: enrich the existing operational row with cost info
      const row = merged.get(opKey)!
      row.costId = c.id
      row.phase = c.phase ?? null
      // Cost row often has more authoritative naming/location
      row.name = c.event_name || row.name
      row.date = c.event_date || row.date
      row.location = c.event_location || row.location
      row.status = c.status || row.status
    } else {
      // Cost-only event (no operational counterpart)
      merged.set(`cost:${c.id}`, {
        operationalId: null,
        costId: c.id,
        name: c.event_name,
        date: c.event_date,
        location: c.event_location,
        status: c.status,
        phase: c.phase ?? null,
      })
    }
  }

  const list = Array.from(merged.values()).sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date.localeCompare(b.date)
  })

  return { data: list }
}

// จำนวนตู้ — เก็บเฉพาะงานขาย (จำนวนเต็ม ≥ 1; ว่าง/ผิดรูปแบบ = 1) ประเภทอื่นเก็บ null
// ข้อความ error ของ PostgREST/Postgres เมื่อคอลัมน์ unit_count ยังไม่มี (ยังไม่รัน migration 20260928)
const isUnitCountMissing = (message: string) => /unit_count/.test(message || '')

function unitCountFor(raw: FormDataEntryValue | null, workType: string | null): number | null {
  if (workType !== 'sale') return null
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n >= 1 ? n : 1
}

export async function createLead(formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const eventDate = formData.get('event_date') as string || null
  const eventEndDate = formData.get('event_end_date') as string || null
  let event_days = 1
  if (eventDate && eventEndDate) {
    const diff = Math.round((new Date(eventEndDate).getTime() - new Date(eventDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
    event_days = Math.max(1, diff)
  }

  const lead = {
    customer_name: formData.get('customer_name') as string,
    customer_line: formData.get('customer_line') as string || null,
    customer_phone: formData.get('customer_phone') as string || null,
    customer_type: formData.get('customer_type') as string || null,
    lead_source: formData.get('lead_source') as string || null,
    is_returning: formData.get('is_returning') === 'true',
    event_date: eventDate,
    event_end_date: eventEndDate,
    event_time: formData.get('event_time') as string || null,
    event_end_time: formData.get('event_end_time') as string || null,
    event_days,
    event_location: formData.get('event_location') as string || null,
    event_details: formData.get('event_details') as string || null,
    package_name: formData.get('package_name') as string || null,
    work_type: formData.get('work_type') as string || null,
    unit_count: unitCountFor(formData.get('unit_count'), formData.get('work_type') as string || null),
    quoted_price: Number(formData.get('quoted_price') || 0),
    confirmed_price: Number(formData.get('confirmed_price') || 0),
    deposit: Number(formData.get('deposit') || 0),
    quotation_ref: formData.get('quotation_ref') as string || null,
    notes: formData.get('notes') as string || null,
    vat_mode: formData.get('vat_mode') as string || 'none',
    wht_rate: Number(formData.get('wht_rate') || 0),
    created_by: userId,
    status: 'lead',
    tags: (formData.get('tags') as string || '').split(',').map(t => t.trim()).filter(Boolean),
    assigned_sales: (formData.get('assigned_sales') as string || '').split(',').filter(Boolean),
    assigned_graphics: (formData.get('assigned_graphics') as string || '').split(',').filter(Boolean),
    assigned_staff: (formData.get('assigned_staff') as string || '').split(',').filter(Boolean),
  }

  let { data, error } = await supabase.from('crm_leads').insert(lead).select().single()
  // ยังไม่รัน migration 20260928 (ไม่มีคอลัมน์ unit_count) → สร้างการ์ดโดยไม่มีจำนวนตู้ ดีกว่าสร้างไม่ได้เลย
  if (error && isUnitCountMissing(error.message)) {
    const withoutUnitCount: Record<string, unknown> = { ...lead }
    delete withoutUnitCount.unit_count
    ;({ data, error } = await supabase.from('crm_leads').insert(withoutUnitCount).select().single())
  }
  if (error) return { error: error.message }

  // Save dynamic installments
  const installmentCount = Number(formData.get('installment_count') || 0)
  if (installmentCount > 0) {
    const installmentRows = []
    for (let i = 1; i <= installmentCount; i++) {
      const amount = Number(formData.get(`installment_${i}`) || 0)
      const dueDate = (formData.get(`installment_${i}_date`) as string) || null
      if (amount > 0 || dueDate) {
        installmentRows.push({
          lead_id: data.id,
          installment_number: i,
          amount,
          due_date: dueDate,
          is_paid: false,
          paid_date: null,
        })
      }
    }
    if (installmentRows.length > 0) {
      await supabase.from('crm_lead_installments').insert(installmentRows)
    }
  }

  // NOTE: staff is NOT assigned at lead creation. It is managed per event (event_staff)
  // and only displayed (grouped by event) on the CRM lead page. The new-lead dialog no
  // longer collects staff, so there is no staff_assignments insert here.

  await logActivity('CREATE_CRM_LEAD', {
    id: data.id,
    customer_name: lead.customer_name,
    is_returning: lead.is_returning,
    lead_source: lead.lead_source,
  })

  revalidatePath('/crm')
  return { success: true, id: data.id }
}

export async function updateLead(id: string, formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  const textFields = [
    'customer_name', 'customer_line', 'customer_phone', 'customer_type',
    'lead_source', 'event_location', 'event_details', 'package_name',
    'quotation_ref', 'notes', 'work_type'
  ]
  textFields.forEach(f => {
    const v = formData.get(f)
    if (v !== null) updates[f] = v as string || null
  })

  const dateFields = ['event_date', 'event_end_date', 'event_time', 'event_end_time']
  dateFields.forEach(f => {
    const v = formData.get(f)
    if (v !== null) updates[f] = (v as string) || null
  })

  const numFields = ['quoted_price', 'confirmed_price', 'deposit', 'wht_rate']
  numFields.forEach(f => {
    const v = formData.get(f)
    if (v !== null) updates[f] = Number(v) || 0
  })

  if (formData.has('is_returning')) updates.is_returning = formData.get('is_returning') === 'true'
  if (formData.has('vat_mode')) updates.vat_mode = formData.get('vat_mode') as string || 'none'

  // Legacy installment fields — still accept updates for backward compat
  const legacyDateFields = ['installment_1_date', 'installment_2_date', 'installment_3_date', 'installment_4_date', 'installment_1_paid_date', 'installment_2_paid_date', 'installment_3_paid_date', 'installment_4_paid_date']
  legacyDateFields.forEach(f => {
    const v = formData.get(f)
    if (v !== null) updates[f] = (v as string) || null
  })
  const legacyNumFields = ['installment_1', 'installment_2', 'installment_3', 'installment_4']
  legacyNumFields.forEach(f => {
    const v = formData.get(f)
    if (v !== null) updates[f] = Number(v) || 0
  })
  const paidFields = ['installment_1_paid', 'installment_2_paid', 'installment_3_paid', 'installment_4_paid']
  paidFields.forEach(f => {
    if (formData.has(f)) updates[f] = formData.get(f) === 'true'
  })

  // Tags — comma-separated string to array
  if (formData.has('tags')) {
    const tagsStr = formData.get('tags') as string || ''
    updates.tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean)
  }

  // Staff assignment arrays — comma-separated string to array
  const arrayFields = ['assigned_sales', 'assigned_graphics', 'assigned_staff']
  arrayFields.forEach(f => {
    if (formData.has(f)) {
      const str = formData.get(f) as string || ''
      updates[f] = str.split(',').filter(Boolean)
    }
  })

  // ตำแหน่งที่ต้องการ — JSON string { "<staff_role>": count }; ตรวจ role กับ staff_role ที่ active และจำนวน 1–20
  // ponytail: validation duplicated with jobs/actions.ts::updateLeadTracking; extract when a third caller appears
  if (formData.has('required_roles')) {
    let parsed: unknown
    try {
      parsed = JSON.parse((formData.get('required_roles') as string) || '{}')
    } catch {
      return { error: 'ตำแหน่งที่ต้องการไม่ถูกต้อง' }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'ตำแหน่งที่ต้องการไม่ถูกต้อง' }
    const { data: roleRows } = await supabase
      .from('crm_settings').select('value').eq('category', 'staff_role').eq('is_active', true)
    const validRoles = new Set((roleRows || []).map(r => r.value as string))
    const clean: Record<string, number> = {}
    for (const [role, count] of Object.entries(parsed as Record<string, unknown>)) {
      if (count === 0) continue
      if (!validRoles.has(role) || !Number.isInteger(count) || (count as number) < 1 || (count as number) > 20) {
        return { error: `ตำแหน่งที่ต้องการไม่ถูกต้อง: ${role}` }
      }
      clean[role] = count as number
    }
    updates.required_roles = clean
  }

  // จำนวนตู้ — แตะคอลัมน์เฉพาะเมื่อฟอร์มส่งมา; ประเภทงานใช้ค่าที่ส่งมาพร้อมกัน ถ้าไม่มีอ่านจาก DB
  if (formData.has('unit_count')) {
    let workType = formData.has('work_type') ? (formData.get('work_type') as string) || null : null
    if (!formData.has('work_type')) {
      const { data: cur } = await supabase.from('crm_leads').select('work_type').eq('id', id).single()
      workType = (cur?.work_type as string | null) ?? null
    }
    updates.unit_count = unitCountFor(formData.get('unit_count'), workType)
  }

  // Auto-calculate event_days
  const ed = (updates.event_date as string) || null
  const eed = (updates.event_end_date as string) || null
  if (ed && eed) {
    const diff = Math.round((new Date(eed).getTime() - new Date(ed).getTime()) / (1000 * 60 * 60 * 24)) + 1
    updates.event_days = Math.max(1, diff)
  }

  let { error } = await supabase.from('crm_leads').update(updates).eq('id', id)
  // ยังไม่รัน migration 20260928 → บันทึกฟิลด์อื่นต่อได้ โดยข้ามจำนวนตู้
  if (error && 'unit_count' in updates && isUnitCountMissing(error.message)) {
    delete updates.unit_count
    ;({ error } = await supabase.from('crm_leads').update(updates).eq('id', id))
  }
  if (error) return { error: error.message }

  // NOTE: staff is no longer edited at the lead level — it is managed per event
  // (event_staff) and only displayed (grouped by event) on the CRM lead page. The old
  // crm_lead_staff write that used to live here was removed as part of that refactor.

  await logActivity('UPDATE_CRM_LEAD', { id, changes: Object.keys(updates).join(', ') })
  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  return { success: true }
}

export async function updateLeadStatus(id: string, newStatus: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // Get current status
  const { data: lead } = await supabase.from('crm_leads').select('status').eq('id', id).single()
  const oldStatus = lead?.status || 'unknown'
  const firstWon = isFirstWon(lead?.status, newStatus) // อ่านก่อนเขียน: สถานะเดิมยังไม่ใช่ won

  // Update status
  const { error } = await supabase
    .from('crm_leads')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }

  // Log activity in crm_activities
  await supabase.from('crm_activities').insert({
    lead_id: id,
    created_by: userId,
    activity_type: 'status_change',
    description: `สถานะเปลี่ยน: ${oldStatus} → ${newStatus}`,
    old_status: oldStatus,
    new_status: newStatus,
  })

  await logActivity('UPDATE_CRM_STATUS', { id, oldStatus, newStatus })

  // ลูกค้าตอบรับ (เข้าสถานะ won ครั้งแรก เช่น ส่งใบเสนอราคา → รับมัดจำ ก็นับ) → ส่งใบงาน (กราฟิก + หน้างาน) เข้าพูลงานให้เองพร้อมแจ้งเตือนทีม
  // จงใจไม่ให้ล้มการเปลี่ยนสถานะ: ถ้าสร้างใบงานหรือแจ้งเตือนพลาด สถานะ lead ต้องเปลี่ยนสำเร็จอยู่ดี
  // (แอดมินยังกด "ส่งต่องาน" เองได้จากหน้า lead) — บันทึก error ไว้ใน log แล้วไปต่อ
  if (firstWon) {
    try {
      const auto = await autoCreateJobsFromAcceptedLead(id)
      if ('error' in auto) console.error('[CRM] auto-create jobs failed:', auto.error)
    } catch (e) {
      console.error('[CRM] auto-create jobs threw:', e)
    }
  }

  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  return { success: true }
}

export async function deleteLead(id: string) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะแอดมินเท่านั้นที่ลบลูกค้าได้ — พนักงานใช้ "เก็บเข้าคลัง" แทน' }

  const supabase = createServiceClient()

  // เก็บ receipt ของ installment ทั้งหมดใน lead (จะถูก cascade ลบ) ไว้ลบไฟล์ตาม
  const { data: insts } = await supabase
    .from('crm_lead_installments').select('receipt_url').eq('lead_id', id)

  const { error } = await supabase.from('crm_leads').delete().eq('id', id)
  if (error) return { error: error.message }

  await removeStorageByUrls(supabase, 'crm-payment-proofs', (insts || []).map(i => i.receipt_url))

  await logActivity('DELETE_CRM_LEAD', { id })
  revalidatePath('/crm')
  return { success: true }
}

export async function archiveLead(id: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('crm_leads')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }

  // Log activity
  await supabase.from('crm_activities').insert({
    lead_id: id,
    created_by: userId,
    activity_type: 'note',
    description: 'ย้ายไปที่ Archive',
  })

  await logActivity('ARCHIVE_CRM_LEAD', { id })
  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  return { success: true }
}

// ── เก็บงานเก่าเข้าคลังเป็นชุด (แอดมินกดเองเท่านั้น ไม่มีการเก็บอัตโนมัติ) — กติกาอยู่ที่ types.ts::staleLeadIds ──
async function findStaleLeads() {
  const supabase = createServiceClient()
  const { rows, error } = await readAllRows<StaleRow>((from, to) => supabase
    .from('crm_leads')
    .select('id, status, updated_at, created_at, event_date')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, to))
  if (error) return { error: error.message }
  return { stale: staleLeadIds(rows, Date.now()) }
}

export async function countStaleLeads() {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะแอดมินเท่านั้น' }
  const res = await findStaleLeads()
  if ('error' in res) return { error: res.error }
  return { closed: res.stale.closed.length, cold: res.stale.cold.length }
}

export async function archiveStaleLeads() {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะแอดมินเท่านั้น' }
  const res = await findStaleLeads()
  if ('error' in res) return { error: res.error }
  const { closed, cold } = res.stale
  const ids = [...closed, ...cold]
  const supabase = createServiceClient()
  const archived_at = new Date().toISOString()
  for (let i = 0; i < ids.length; i += 500) {
    // ponytail: ไม่ลง crm_activities รายตัว (หลายร้อยแถว) — log รวมครั้งเดียวพร้อม id พอสำหรับ audit
    const { error } = await supabase.from('crm_leads').update({ archived_at }).in('id', ids.slice(i, i + 500))
    if (error) return { error: error.message }
  }
  await logActivity('ARCHIVE_CRM_LEAD', { bulk: true, closed, cold }) // เก็บ id ไว้ เผื่อต้องนำออกจากคลังทั้งชุด
  revalidatePath('/crm')
  revalidatePath('/crm/archive')
  return { success: true, archived: ids.length }
}

export async function unarchiveLead(id: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('crm_leads')
    .update({ archived_at: null })
    .eq('id', id)
  if (error) return { error: error.message }

  // Log activity
  await supabase.from('crm_activities').insert({
    lead_id: id,
    created_by: userId,
    activity_type: 'note',
    description: 'นำออกจาก Archive แล้ว',
  })

  await logActivity('UNARCHIVE_CRM_LEAD', { id })
  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  revalidatePath('/crm/archive')
  return { success: true }
}

// ============================================================================
// CRM Activities — บันทึกการติดตาม
// ============================================================================

export async function getActivities(leadId: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('crm_activities')
    .select('*, profiles:created_by(full_name)')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

export async function createActivity(leadId: string, formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const activity_type = formData.get('activity_type') as string
  const description = formData.get('description') as string

  const { error } = await supabase.from('crm_activities').insert({
    lead_id: leadId,
    created_by: userId,
    activity_type,
    description,
  })

  if (error) return { error: error.message }

  // Update lead's updated_at
  await supabase.from('crm_leads').update({ updated_at: new Date().toISOString() }).eq('id', leadId)

  await logActivity('CREATE_CRM_ACTIVITY', { leadId, activity_type, description })

  // Notify @mentioned users
  const mentionedUsers = (formData.get('notify_users') as string || '').split(',').filter(Boolean)
  if (mentionedUsers.length > 0) {
    const { data: lead } = await supabase.from('crm_leads').select('company_name, contact_name').eq('id', leadId).single()
    const leadName = lead?.company_name || lead?.contact_name || 'Lead'
    await createNotifications({
      userIds: mentionedUsers,
      type: 'crm_mentioned',
      title: `คุณถูกแท็กใน CRM: ${leadName}`,
      body: description?.replace(/@\[[^\]]+\]\([^)]+\)/g, match => {
        const m = match.match(/@\[([^\]]+)\]/);
        return m ? `@${m[1]}` : match;
      }).substring(0, 200) || undefined,
      referenceType: 'crm_lead',
      referenceId: leadId,
      actorId: userId,
    })
  }

  revalidatePath(`/crm/${leadId}`)
  return { success: true }
}

// ============================================================================
// เปิดอีเวนต์จาก CRM Lead
// ============================================================================

export async function createEventFromLead(leadId: string, phase?: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // Get lead data
  const { data: lead, error: leadErr } = await supabase
    .from('crm_leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) return { error: 'ไม่พบข้อมูล Lead' }

  // 1 CRM lead can be linked to multiple job_cost_events (setup / main / teardown / delivery / etc.)
  // Reverse FK is job_cost_events.linked_lead_id.

  const allowedPhases = ['setup', 'main', 'teardown', 'delivery', 'other']
  const phaseValue = phase && allowedPhases.includes(phase) ? phase : null

  // Build a descriptive name that hints at the phase
  const phaseSuffix = phaseValue && phaseValue !== 'main'
    ? ({ setup: ' [Setup]', teardown: ' [Teardown]', delivery: ' [Delivery]', other: ' [Other]' } as Record<string, string>)[phaseValue] || ''
    : ''

  // Create job_cost_events (linked to lead via linked_lead_id)
  const { data: event, error: eventErr } = await supabase
    .from('job_cost_events')
    .insert({
      event_name: `${lead.customer_name} — ${lead.package_name || 'N/A'}${phaseSuffix}`,
      event_date: lead.event_date,
      event_location: lead.event_location,
      staff: null,
      revenue: lead.confirmed_price || lead.quoted_price || 0,
      revenue_vat_mode: lead.vat_mode || 'none',
      revenue_wht_rate: Number(lead.wht_rate || 0),
      linked_lead_id: leadId,
      status: 'draft',
      phase: phaseValue,
      notes: lead.notes,
      imported_by: userId,
    })
    .select()
    .single()

  if (eventErr || !event) return { error: eventErr?.message || 'สร้าง Event ไม่สำเร็จ' }

  // The link is via job_cost_events.linked_lead_id set in the insert above (1 lead → N events).
  await supabase.from('crm_leads').update({ updated_at: new Date().toISOString() }).eq('id', leadId)

  // Log activity
  await supabase.from('crm_activities').insert({
    lead_id: leadId,
    created_by: userId,
    activity_type: 'note',
    description: `เปิดอีเวนต์แล้ว: ${event.event_name}`,
  })

  await logActivity('CREATE_EVENT_FROM_CRM', { leadId, eventId: event.id })
  revalidatePath('/crm')
  revalidatePath(`/crm/${leadId}`)
  revalidatePath('/costs/events')
  return { success: true, eventId: event.id }
}

// ============================================================================
// ตรวจสอบวันที่ซ้ำกับอีเวนต์อื่น
// ============================================================================

export async function checkEventDateConflicts(eventDate: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('job_cost_events')
    .select('id, event_name, event_date, event_location')
    .eq('event_date', eventDate)

  if (error) return []
  return data || []
}

// ============================================================================
// CRM Lead Installments — CRUD (Normalized)
// ============================================================================

export interface LeadInstallment {
  id: string
  lead_id: string
  installment_number: number
  amount: number
  due_date: string | null
  is_paid: boolean
  paid_date: string | null
  receipt_url: string | null
  created_at: string
}

export async function getLeadInstallments(leadId: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('crm_lead_installments')
    .select('*')
    .eq('lead_id', leadId)
    .order('installment_number', { ascending: true })

  if (error) return []
  return (data || []) as LeadInstallment[]
}

/** Bulk save all installments for a lead (used by the lead detail form) */
export async function saveAllInstallments(leadId: string, installments: Array<{
  installment_number: number
  amount: number
  due_date: string | null
  is_paid: boolean
  paid_date: string | null
}>) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // Fetch existing installments to preserve receipt_url
  const { data: existingRows } = await supabase
    .from('crm_lead_installments')
    .select('id, installment_number, receipt_url')
    .eq('lead_id', leadId)

  const existingMap = new Map(
    (existingRows || []).map(r => [r.installment_number, r])
  )

  // Delete installments that are no longer in the list
  const keepNumbers = new Set(installments.map(i => i.installment_number))
  const toDelete = (existingRows || []).filter(r => !keepNumbers.has(r.installment_number))
  if (toDelete.length > 0) {
    await supabase
      .from('crm_lead_installments')
      .delete()
      .in('id', toDelete.map(r => r.id))
  }

  // Upsert (update existing / insert new) — preserving receipt_url
  if (installments.length > 0) {
    // Delete all remaining and re-insert with receipt_url preserved
    const remainingIds = (existingRows || [])
      .filter(r => keepNumbers.has(r.installment_number))
      .map(r => r.id)
    if (remainingIds.length > 0) {
      await supabase
        .from('crm_lead_installments')
        .delete()
        .in('id', remainingIds)
    }

    const rows = installments.map(inst => ({
      lead_id: leadId,
      installment_number: inst.installment_number,
      amount: inst.amount,
      due_date: inst.due_date || null,
      is_paid: inst.is_paid,
      paid_date: inst.paid_date || null,
      receipt_url: existingMap.get(inst.installment_number)?.receipt_url || null,
    }))
    const { error } = await supabase.from('crm_lead_installments').insert(rows)
    if (error) return { error: error.message }
  }

  await supabase.from('crm_leads').update({ updated_at: new Date().toISOString() }).eq('id', leadId)

  await logActivity('UPDATE_CRM_INSTALLMENTS', { leadId, count: installments.length })
  revalidatePath(`/crm/${leadId}`)
  revalidatePath('/crm/payments')
  return { success: true }
}

// ============================================================================
// CRM Payment Proof Upload — สลิป/หลักฐานการชำระเงิน
// ============================================================================

export async function uploadPaymentProof(leadId: string, installmentId: string, formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const file = formData.get('file') as File
  if (!file || file.size === 0) return { error: 'No file provided' }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
  if (!allowedTypes.includes(file.type)) {
    return { error: 'ไฟล์ต้องเป็น JPEG, PNG, WebP, GIF หรือ PDF เท่านั้น' }
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    return { error: 'ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 10MB)' }
  }

  const supabase = createServiceClient()

  // Generate unique file path
  const ext = file.name.split('.').pop() || 'jpg'
  const filePath = `${leadId}/${installmentId}_${Date.now()}.${ext}`

  // Delete old file if exists
  const { data: existingInstallment } = await supabase
    .from('crm_lead_installments')
    .select('receipt_url')
    .eq('id', installmentId)
    .single()

  if (existingInstallment?.receipt_url) {
    const oldPath = existingInstallment.receipt_url.split('/crm-payment-proofs/')[1]
    if (oldPath) {
      await supabase.storage.from('crm-payment-proofs').remove([oldPath])
    }
  }

  // Convert File to ArrayBuffer then to Buffer for server-side upload
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('crm-payment-proofs')
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) return { error: `อัพโหลดไม่สำเร็จ: ${uploadError.message}` }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('crm-payment-proofs')
    .getPublicUrl(filePath)

  const receiptUrl = urlData.publicUrl

  // Update installment with receipt_url
  const { error: updateError } = await supabase
    .from('crm_lead_installments')
    .update({ receipt_url: receiptUrl })
    .eq('id', installmentId)

  if (updateError) return { error: updateError.message }

  await logActivity('UPLOAD_PAYMENT_PROOF', { leadId, installmentId, filePath })
  revalidatePath(`/crm/${leadId}`)
  return { success: true, url: receiptUrl }
}

export async function deletePaymentProof(leadId: string, installmentId: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // Get current receipt_url
  const { data: installment } = await supabase
    .from('crm_lead_installments')
    .select('receipt_url')
    .eq('id', installmentId)
    .single()

  if (installment?.receipt_url) {
    const filePath = installment.receipt_url.split('/crm-payment-proofs/')[1]
    if (filePath) {
      await supabase.storage.from('crm-payment-proofs').remove([filePath])
    }
  }

  // Clear receipt_url
  const { error } = await supabase
    .from('crm_lead_installments')
    .update({ receipt_url: null })
    .eq('id', installmentId)

  if (error) return { error: error.message }

  await logActivity('DELETE_PAYMENT_PROOF', { leadId, installmentId })
  revalidatePath(`/crm/${leadId}`)
  return { success: true }
}

// ============================================================================
// CRM Lead Staff — per event (read-only here)
// ============================================================================

export interface LeadEventStaff {
  eventId: string
  eventName: string
  eventDate: string | null
  phase: string | null
  staff: { user_id: string; full_name: string | null; role: string }[]
}

/**
 * Staff for a lead, grouped per operational event. Staff now lives in event_staff
 * (keyed by event_id), so each sub-event under the same lead has its own independent
 * team. The CRM lead page uses this to display staff broken out by event (read-only;
 * editing happens in each event's edit page).
 */
export async function getLeadEventStaff(leadId: string): Promise<LeadEventStaff[]> {
  const supabase = createServiceClient()

  const { data: events } = await supabase
    .from('events')
    .select('id, name, event_date, phase')
    .eq('crm_lead_id', leadId)
    .order('event_date', { ascending: true })

  if (!events || events.length === 0) return []

  const eventIds = events.map(e => e.id)
  type StaffRow = { event_id: string; user_id: string; role: string; profiles: { full_name: string | null } | null }
  const { data: staffRows } = await supabase
    .from('event_staff')
    .select('event_id, user_id, role, profiles:user_id(full_name)')
    .in('event_id', eventIds)
    .order('created_at', { ascending: true })
    .overrideTypes<StaffRow[], { merge: false }>()

  const byEvent = new Map<string, { user_id: string; full_name: string | null; role: string }[]>()
  for (const s of staffRows || []) {
    if (!byEvent.has(s.event_id)) byEvent.set(s.event_id, [])
    byEvent.get(s.event_id)!.push({
      user_id: s.user_id,
      full_name: s.profiles?.full_name || null,
      role: s.role,
    })
  }

  return events.map(e => ({
    eventId: e.id,
    eventName: e.name,
    eventDate: e.event_date,
    phase: (e as { phase?: string | null }).phase ?? null,
    staff: byEvent.get(e.id) || [],
  }))
}
