'use server'

import { cookies } from 'next/headers'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import {
  DOC_TYPES,
  DOC_STATUSES,
  STATUS_LABEL,
  type DocStatus,
  type DocTypeCode,
} from '../doc-types'

// Resolve the acting user with a DB-verified role — NEVER trust the raw
// `session_role` cookie.
// ponytail: คัดลอกจาก documents/settings/actions.ts แทนที่จะ refactor เป็น helper กลาง
// (ไฟล์นั้นถูกแก้โดย agent อื่นพร้อมกัน — ห้ามแตะ)
async function getSession(): Promise<{ userId?: string; role?: string }> {
  const session = await requireAuth()
  if (session) return { userId: session.userId, role: session.role }

  const cookieStore = await cookies()
  if (cookieStore.get('session_token')?.value) return {}
  const legacyId = cookieStore.get('session_user_id')?.value
  if (!legacyId) return {}
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, role, is_approved')
    .eq('id', legacyId)
    .single()
  if (!data || !data.is_approved) return {}
  return { userId: data.id, role: data.role || 'staff' }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface TypeTotal {
  doc_type: DocTypeCode
  label: string
  sum: number
  count: number
}

export interface StatusCount {
  status: DocStatus
  label: string
  count: number
}

export interface PendingRow {
  id: string
  draft_no: string
  doc_type: DocTypeCode
  party_name: string | null
  net_payable: number
  submitted_at: string | null
  /** คำนวณฝั่ง server — ฝั่ง client เรียก Date.now() ตอน render ไม่ได้ (react-hooks/purity) */
  overdue: boolean
  waited_hours: number | null
}

export interface DocumentsDashboard {
  month: string
  isAdmin: boolean
  pendingCount: number
  overdueCount: number
  issuedThisMonth: number
  totalByType: TypeTotal[]
  byStatus: StatusCount[]
  avgApprovalHours: number | null
  recentPending: PendingRow[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const BKK_OFFSET = '+07:00' // ไทยไม่มี DST — offset คงที่

/** เดือนปัจจุบันตามเวลาไทย รูปแบบ YYYY-MM */
function currentMonthBangkok(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7)
}

/** [เริ่ม, สิ้นสุด) ของเดือนตามเวลาไทย เป็น epoch ms */
function monthWindow(month: string): { start: number; end: number } {
  const [y, m] = month.split('-').map(Number)
  const start = Date.parse(`${month}-01T00:00:00${BKK_OFFSET}`)
  const nextY = m === 12 ? y + 1 : y
  const nextM = m === 12 ? 1 : m + 1
  const end = Date.parse(
    `${nextY}-${String(nextM).padStart(2, '0')}-01T00:00:00${BKK_OFFSET}`
  )
  return { start, end }
}

const inWindow = (iso: string | null | undefined, w: { start: number; end: number }) => {
  if (!iso) return false
  const t = Date.parse(iso)
  return t >= w.start && t < w.end
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 * ตัวเลขสรุปของโมดูลเอกสาร (spec: user stories 42–43)
 * admin เห็นทุกใบ / ผู้ใช้ทั่วไปเห็นเฉพาะเอกสารที่ตัวเองสร้าง
 */
export async function getDocumentsDashboard(
  opts: { month?: string } = {}
): Promise<DocumentsDashboard | { error: string }> {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  const isAdmin = role === 'admin'

  const month =
    opts.month && MONTH_RE.test(opts.month) ? opts.month : currentMonthBangkok()
  const w = monthWindow(month)

  // ponytail: select เดียวดึงเฉพาะคอลัมน์ที่ใช้ แล้วรวมยอดใน TS —
  // ปริมาณเอกสารระดับหลักพันแถวเท่านั้น ไม่คุ้มที่จะเขียน RPC/aggregate ฝั่ง DB
  // (byStatus ต้องนับทุกช่วงเวลาอยู่แล้ว จึงไม่กรองเดือนที่ query)
  const supabase = createServiceClient()
  let query = supabase
    .from('documents')
    .select(
      'id, draft_no, doc_type, status, party_name, net_payable, created_by, submitted_at, approved_at, issued_at'
    )
  if (!isAdmin) query = query.eq('created_by', userId)

  const { data, error } = await query
  if (error) return { error: error.message }

  type Row = {
    id: string
    draft_no: string
    doc_type: DocTypeCode
    status: DocStatus
    party_name: string | null
    net_payable: number | null
    created_by: string | null
    submitted_at: string | null
    approved_at: string | null
    issued_at: string | null
  }
  const rows = (data || []) as unknown as Row[]

  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000

  let pendingCount = 0
  let overdueCount = 0
  let issuedThisMonth = 0
  let approvalMs = 0
  let approvalN = 0

  const typeMap = new Map<DocTypeCode, { sum: number; count: number }>()
  const statusMap = new Map<DocStatus, number>()
  const pending: PendingRow[] = []

  for (const r of rows) {
    statusMap.set(r.status, (statusMap.get(r.status) || 0) + 1)

    if (r.status === 'pending_approval') {
      pendingCount++
      const waitedMs = r.submitted_at ? now - Date.parse(r.submitted_at) : null
      const overdue = waitedMs !== null && waitedMs > DAY_MS
      if (overdue) overdueCount++
      pending.push({
        id: r.id,
        draft_no: r.draft_no,
        doc_type: r.doc_type,
        party_name: r.party_name,
        net_payable: Number(r.net_payable || 0),
        submitted_at: r.submitted_at,
        overdue,
        waited_hours: waitedMs === null ? null : Math.round((waitedMs / 3_600_000) * 10) / 10,
      })
    }

    if (inWindow(r.issued_at, w)) {
      issuedThisMonth++
      const def = DOC_TYPES[r.doc_type]
      if (
        def?.hasAmounts &&
        (r.status === 'issued' || r.status === 'sent' || r.status === 'closed')
      ) {
        const cur = typeMap.get(r.doc_type) || { sum: 0, count: 0 }
        cur.sum += Number(r.net_payable || 0)
        cur.count++
        typeMap.set(r.doc_type, cur)
      }
    }

    if (inWindow(r.approved_at, w) && r.submitted_at && r.approved_at) {
      const diff = Date.parse(r.approved_at) - Date.parse(r.submitted_at)
      if (diff >= 0) {
        approvalMs += diff
        approvalN++
      }
    }
  }

  const totalByType: TypeTotal[] = [...typeMap.entries()]
    .map(([doc_type, v]) => ({
      doc_type,
      label: DOC_TYPES[doc_type]?.label.th || doc_type,
      sum: Math.round(v.sum * 100) / 100,
      count: v.count,
    }))
    .sort((a, b) => b.sum - a.sum)

  const byStatus: StatusCount[] = DOC_STATUSES.map((s) => ({
    status: s,
    label: STATUS_LABEL[s].th,
    count: statusMap.get(s) || 0,
  }))

  // เก่าสุดขึ้นก่อน — ใบที่ยังไม่มี submitted_at (ข้อมูลเก่า) ไปท้ายสุด
  const recentPending = pending
    .sort((a, b) => {
      if (!a.submitted_at) return 1
      if (!b.submitted_at) return -1
      return a.submitted_at.localeCompare(b.submitted_at)
    })
    .slice(0, 5)

  return {
    month,
    isAdmin,
    pendingCount,
    overdueCount,
    issuedThisMonth,
    totalByType,
    byStatus,
    avgApprovalHours:
      approvalN > 0 ? Math.round((approvalMs / approvalN / 3_600_000) * 10) / 10 : null,
    recentPending,
  }
}
