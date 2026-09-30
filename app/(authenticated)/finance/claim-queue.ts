// ============================================================================
// คิวใบเบิก (หน้าแรกของแอดมิน) — ใบไหนอยู่กลุ่มไหน · รอมานานเท่าไร · ค้างนานหรือยัง · ทำทีละหลายใบได้กับใบไหน
// ไฟล์กติกาล้วน: ไม่ import next/*, supabase หรือ react (import type เท่านั้น) — ใช้ได้ทั้งหน้าจอ server/client และในชุดตรวจ
// ตรวจด้วย claim-queue.check.ts ข้างไฟล์นี้
// ============================================================================

import { paymentLock } from './claim-rules'
import { findTransition } from './claim-transitions'
import type { BulkAction, BulkResult } from './lifecycle-actions'
import type { QueueClaim } from './queue-data'

export type QueueGroupKey = 'review' | 'tax_invoice' | 'pay' | 'advance' | 'stale'

/** กลุ่มของคิวตามลำดับที่แสดง */
export const QUEUE_GROUPS: readonly { key: QueueGroupKey; labelTh: string; labelEn: string }[] = [
  { key: 'review', labelTh: 'ต้องตรวจ', labelEn: 'To review' },
  { key: 'tax_invoice', labelTh: 'รอใบกำกับภาษี', labelEn: 'Awaiting tax invoice' },
  { key: 'pay', labelTh: 'รอจ่าย', labelEn: 'To pay' },
  { key: 'advance', labelTh: 'รอเคลียร์เงินทดลองจ่าย', labelEn: 'Advances to clear' },
  { key: 'stale', labelTh: 'ค้างนาน', labelEn: 'Overdue' },
]

export const isQueueGroupKey = (v: unknown): v is QueueGroupKey => QUEUE_GROUPS.some(g => g.key === v)

/** จำนวนวันที่ใบอยู่ในขั้นเดิมแล้วถือว่า "ค้างนาน" (เจ้าของเลือก 2026-09-30 — เปลี่ยนได้ในรุ่นถัดไปโดยไม่ต้องรัน SQL) */
export const STALE_DAYS = {
  draft: 30,
  pending: 7,
  approved: 30,
  waiting_tax_invoice: 30,
  pending_month_end: 45,
  advance_unsettled: 30,
} as const

/** ทำทีละหลายใบได้ครั้งละไม่เกินนี้ (server ตรวจซ้ำ: 'ทำได้ครั้งละ 1–50 ใบ') */
export const BULK_MAX = 50

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** สถานะที่นับอายุจากเวลาอนุมัติ (ไม่มี status_changed_at) */
const APPROVED_LIKE: readonly string[] = ['approved', 'waiting_tax_invoice', 'pending_month_end', 'awaiting_payment']

type AgeFields = {
  status: string
  submitted_at: string | null
  approved_at: string | null
  paid_at: string | null
  created_at: string
  status_changed_at?: string | null
}

/** เวลาที่ใบเข้าสู่ขั้นปัจจุบัน — status_changed_at (trigger ในฐานข้อมูล) ก่อน ไม่มีจึงเดาจากเวลาของสถานะนั้น */
export function ageAnchor(c: AgeFields): string {
  if (c.status_changed_at) return c.status_changed_at
  const byStatus = c.status === 'pending'
    ? c.submitted_at
    : APPROVED_LIKE.includes(c.status)
      ? c.approved_at
      : c.status === 'paid' ? c.paid_at : null
  return byStatus || c.created_at
}

/** ms ที่ผ่านมาตั้งแต่ iso (เวลาอ่านไม่ได้ / อยู่ในอนาคต = 0) */
const elapsedMs = (iso: string, now: Date) => {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : Math.max(0, now.getTime() - t)
}

/** อายุของงานเป็นวันเต็ม */
export function ageDays(c: AgeFields, now: Date): number {
  return Math.floor(elapsedMs(ageAnchor(c), now) / DAY_MS)
}

/** '25 นาที' · '2 ชม.' · '1 วัน' · '12 วัน' (หน้าจอเติม 'ยื่นเมื่อ … ก่อน' / 'รอมาแล้ว …') */
export function ageText(anchorIso: string, now: Date, isEn: boolean): string {
  const ms = elapsedMs(anchorIso, now)
  if (ms < HOUR_MS) {
    const m = Math.max(1, Math.floor(ms / 60000))
    return isEn ? `${m} min` : `${m} นาที`
  }
  if (ms < DAY_MS) {
    const h = Math.floor(ms / HOUR_MS)
    return isEn ? `${h} hr` : `${h} ชม.`
  }
  const d = Math.floor(ms / DAY_MS)
  return isEn ? `${d} ${d === 1 ? 'day' : 'days'}` : `${d} วัน`
}

type AdvanceFields = {
  claim_type: string
  status: string
  actual_spent_amount: number | null
  refund_confirmed_at: string | null
  refund_amount: number | null
}

/**
 * ทดลองจ่ายที่จ่ายแล้วแต่ยังไม่จบ: unsettled = รอผู้เบิกรายงานยอดใช้จริง · refund_pending = รอแอดมินยืนยันเงินคืน
 * ใบอื่น = null
 */
export function advanceState(c: AdvanceFields): 'unsettled' | 'refund_pending' | null {
  if (c.claim_type !== 'advance' || c.status !== 'paid') return null
  if (c.actual_spent_amount == null) return 'unsettled'
  if (!c.refund_confirmed_at && (Number(c.refund_amount) || 0) > 0) return 'refund_pending'
  return null
}

/** กลุ่มหลักของใบ (แบบร่างไม่มีกลุ่มหลัก — เข้าคิวเฉพาะเมื่อค้างนาน) */
export function primaryGroup(c: AdvanceFields): QueueGroupKey | null {
  if (advanceState(c)) return 'advance'
  if (c.status === 'pending') return 'review'
  if (c.status === 'waiting_tax_invoice') return 'tax_invoice'
  if (c.status === 'approved' || c.status === 'pending_month_end' || c.status === 'awaiting_payment') return 'pay'
  return null
}

/** เกณฑ์ค้างนานของใบนี้ (วัน) — null = ไม่มีเกณฑ์ */
function staleThreshold(c: AdvanceFields): number | null {
  if (advanceState(c)) return STALE_DAYS.advance_unsettled
  switch (c.status) {
    case 'draft': return STALE_DAYS.draft
    case 'pending': return STALE_DAYS.pending
    case 'approved':
    case 'awaiting_payment': return STALE_DAYS.approved
    case 'waiting_tax_invoice': return STALE_DAYS.waiting_tax_invoice
    case 'pending_month_end': return STALE_DAYS.pending_month_end
    default: return null
  }
}

/** ใบอยู่ในขั้นเดิมนานถึงเกณฑ์แล้วหรือยัง */
export function isStale(c: AdvanceFields & AgeFields, now: Date): boolean {
  const days = staleThreshold(c)
  return days !== null && ageDays(c, now) >= days
}

// เทียบตัวเลขในเลขที่ใบเบิกแบบตัวเลข: EXP-202609-1000 ต้องมาหลัง EXP-202609-999
const NUMBER_ORDER = new Intl.Collator('en', { numeric: true })

/** เก่าสุดก่อน (อายุมากสุดขึ้นก่อน) · เวลาเท่ากันเรียงตามเลขที่ใบเบิก */
export function oldestFirst<T extends QueueClaim>(list: T[]): T[] {
  const time = (c: T) => {
    const t = new Date(ageAnchor(c)).getTime()
    return Number.isNaN(t) ? 0 : t
  }
  return [...list].sort((a, b) => time(a) - time(b) || NUMBER_ORDER.compare(a.claim_number, b.claim_number))
}

/** ใบในคิว → กลุ่ม (ใบหนึ่งอยู่ได้สองกลุ่ม: กลุ่มหลัก + ค้างนาน) ทุกกลุ่มเรียงเก่าสุดก่อน */
export function groupClaims(claims: QueueClaim[], now: Date): Record<QueueGroupKey, QueueClaim[]> {
  const groups: Record<QueueGroupKey, QueueClaim[]> = { review: [], tax_invoice: [], pay: [], advance: [], stale: [] }
  for (const c of claims) {
    const g = primaryGroup(c)
    if (g) groups[g].push(c)
    if (isStale(c, now)) groups.stale.push(c)
  }
  for (const key of Object.keys(groups) as QueueGroupKey[]) groups[key] = oldestFirst(groups[key])
  return groups
}

export function queueCounts(groups: Record<QueueGroupKey, QueueClaim[]>): Record<QueueGroupKey, number> {
  return {
    review: groups.review.length,
    tax_invoice: groups.tax_invoice.length,
    pay: groups.pay.length,
    advance: groups.advance.length,
    stale: groups.stale.length,
  }
}

/** "งานที่รอคุณ" = ต้องตรวจ + รอใบกำกับ + รอจ่าย + ทดลองจ่ายที่รอยืนยันเงินคืน (ใบที่รอผู้เบิกเคลียร์ไม่นับ) */
export function waitingOnAdmin(groups: Record<QueueGroupKey, QueueClaim[]>): number {
  return groups.review.length + groups.tax_invoice.length + groups.pay.length
    + groups.advance.filter(c => advanceState(c) === 'refund_pending').length
}

// ── เครื่องมือของรายการ (ค้นหา · ผู้เบิก · ประเภท · เรียง) ─────────────────────────────

export type QueueSort = 'oldest' | 'newest' | 'amount'
export interface QueueFilters { q: string; by: string; type: string; sort: QueueSort }
export const EMPTY_QUEUE_FILTERS: QueueFilters = { q: '', by: '', type: 'all', sort: 'oldest' }

/** ค้นหาในใบที่โหลดมาแล้วทุกเดือน (เลขที่ หัวข้อ ชื่อผู้เบิก ชื่องาน) + ผู้เบิก + ประเภท แล้วเรียง (รายการเข้ามาเรียงเก่าสุดก่อนแล้ว) */
export function filterQueue(list: QueueClaim[], f: QueueFilters): QueueClaim[] {
  const q = f.q.trim().toLowerCase()
  const shown = list.filter(c =>
    (!f.by || c.submitted_by === f.by)
    && (f.type === 'all' || c.claim_type === f.type)
    && (!q || [c.claim_number, c.title, c.submitter?.full_name, c.job_event?.event_name].some(t => !!t && t.toLowerCase().includes(q))))
  if (f.sort === 'newest') return [...shown].reverse()
  if (f.sort === 'amount') return [...shown].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
  return shown
}

/** รายชื่อผู้เบิกในคิว เรียงตามชื่อ */
export function queueSubmitters(claims: QueueClaim[]): { id: string; name: string; count: number }[] {
  const people = new Map<string, { id: string; name: string; count: number }>()
  for (const c of claims) {
    if (!c.submitted_by) continue
    const p = people.get(c.submitted_by) ?? { id: c.submitted_by, name: c.submitter?.full_name || '—', count: 0 }
    p.count += 1
    people.set(c.submitted_by, p)
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'))
}

// ── ทำทีละหลายใบ ────────────────────────────────────────────────────────────

/**
 * ใบที่เลือกซึ่งทำ action นี้ได้ — สถานะต้องอยู่ใน from ของการเปลี่ยนสถานะ · จ่ายต้องไม่ติดล็อกการจ่าย
 * skipped บอกเหตุผลเป็นข้อความเดียวกับที่ server จะตอบ
 */
export function bulkEligible(action: BulkAction, claims: QueueClaim[]): {
  eligible: QueueClaim[]
  skipped: { claim: QueueClaim; reason: string }[]
} {
  const eligible: QueueClaim[] = []
  const skipped: { claim: QueueClaim; reason: string }[] = []
  const row = findTransition(action)
  for (const claim of claims) {
    if (!row || !findTransition(action, claim.status)) {
      skipped.push({ claim, reason: row?.wrongStatusError ?? 'การกระทำไม่ถูกต้อง' })
      continue
    }
    const lock = action === 'pay' ? paymentLock(claim) : null
    if (lock?.locked) skipped.push({ claim, reason: lock.message })
    else eligible.push(claim)
  }
  return { eligible, skipped }
}

/**
 * ผลของการทำทีละหลายใบ → ที่เลือกเหลือเฉพาะใบที่ไม่สำเร็จ (และใบที่ไม่ได้ส่งไป) + ข้อความผิดพลาดของแต่ละใบ
 * server คืน id ตัวพิมพ์เล็ก — เทียบแบบไม่สนตัวพิมพ์ แล้วใช้ id เดิมของหน้าจอเป็น key
 */
export function applyBulkResults(selected: ReadonlySet<string>, results: BulkResult[]): {
  selected: Set<string>
  errors: Map<string, string>
  succeeded: Set<string>
} {
  const byLower = new Map([...selected].map(id => [id.toLowerCase(), id]))
  const next = new Set(selected)
  const errors = new Map<string, string>()
  const succeeded = new Set<string>()
  for (const r of results) {
    const id = byLower.get(r.id.toLowerCase()) ?? r.id
    if (r.ok) {
      next.delete(id)
      succeeded.add(id)
    } else {
      errors.set(id, r.error || 'เกิดข้อผิดพลาด')
    }
  }
  return { selected: next, errors, succeeded }
}

/** ข้อความ toast หลังทำทีละหลายใบ: 'อนุมัติแล้ว 2 ใบ · ไม่สำเร็จ 1 ใบ' */
export function bulkToastText(labelTh: string, labelEn: string, done: number, failed: number, isEn: boolean): string {
  if (isEn) return `${labelEn}: ${done} done${failed > 0 ? ` · ${failed} failed` : ''}`
  return `${labelTh}แล้ว ${done} ใบ${failed > 0 ? ` · ไม่สำเร็จ ${failed} ใบ` : ''}`
}

/** ใบถัดไปในกลุ่ม (หลังทำเสร็จในแผงข้าง) — ใบสุดท้ายหรือไม่อยู่ในรายการ = null */
export function nextInGroup(list: { id: string }[], currentId: string): string | null {
  const i = list.findIndex(c => c.id === currentId)
  return i >= 0 && i + 1 < list.length ? list[i + 1].id : null
}
