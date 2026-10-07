// CRM shared types + status helpers (moved out of crm-dashboard.tsx so non-view code can import them).

export type LeadStatus = string

// Fallback config for unknown statuses
export const FALLBACK_STATUS = { label: 'Unknown', labelTh: 'ไม่ทราบ', color: '#9ca3af', bgColor: 'bg-zinc-100 dark:bg-zinc-800', textColor: 'text-zinc-600 dark:text-zinc-400' }

// Get ordered status list from settings
export function getStatusesFromSettings(settings: CrmSetting[]): string[] {
  return settings
    .filter(s => s.category === 'kanban_status' && s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(s => s.value)
}

// Get status config from settings (color, labels, etc.)
export function getStatusConfig(settings: CrmSetting[], status: string): { label: string; labelTh: string; color: string; bgColor: string; textColor: string } {
  const s = settings.find(st => st.category === 'kanban_status' && st.value === status)
  // ไม่มีแถวตั้งค่า → โชว์ค่าดิบ (เช่น "lead") ดีกว่า "ไม่ทราบ" ที่ทำให้ทุกคอลัมน์ที่ขาดหน้าตาเหมือนกัน
  if (!s) return { ...FALLBACK_STATUS, label: status, labelTh: status }
  return {
    label: s.label_en,
    labelTh: s.label_th,
    color: s.color || '#9ca3af',
    bgColor: `bg-zinc-100 dark:bg-zinc-800`,
    textColor: `text-zinc-600 dark:text-zinc-400`,
  }
}

/** สถานะที่ลูกค้าใช้อยู่แต่ไม่มีแถวตั้งค่าที่เปิดอยู่ — เรียงจำนวนมาก → น้อย แล้วตามชื่อ */
export function unknownStatuses(settings: CrmSetting[], leads: { status: string }[]): string[] {
  const known = new Set(getStatusesFromSettings(settings))
  const counts = new Map<string, number>()
  // ponytail: status ว่าง/null ข้ามไป (คอลัมน์ไม่มีชื่อช่วยใครไม่ได้)
  for (const l of leads) if (l.status && !known.has(l.status)) counts.set(l.status, (counts.get(l.status) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([s]) => s)
}

/** คอลัมน์บนบอร์ด = สถานะที่ตั้งค่าไว้ + สถานะที่มีในข้อมูลจริงแต่ไม่ได้ตั้งค่า (การ์ดต้องไม่หายจากบอร์ด) */
export function boardStatuses(settings: CrmSetting[], leads: { status: string }[]): string[] {
  return [...getStatusesFromSettings(settings), ...unknownStatuses(settings, leads)]
}

// ── "ปิดการขาย" — นิยามเดียวทั้งระบบ ──
// "ตอบรับแล้ว" = ทุกสถานะที่ไม่อยู่ในรายการนี้ (สถานะใหม่ที่เพิ่มใน kanban ภายหลังถือเป็น won อัตโนมัติ)
export const NOT_WON_STATUSES: readonly string[] = ['lead', 'booking', 'following_up', 'quotation_sent', 'rejected', 'cancelled']
export const NOT_WON = new Set(NOT_WON_STATUSES)

export function isWonStatus(status: string | null | undefined): boolean {
  const s = (status || '').trim().toLowerCase()
  return s !== '' && !NOT_WON.has(s)
}

/** เข้าสถานะ won ครั้งแรก (จาก non-won) — ใช้เป็นจุดสร้างใบงานอัตโนมัติ */
export function isFirstWon(oldStatus: string | null | undefined, newStatus: string | null | undefined): boolean {
  return !isWonStatus(oldStatus) && isWonStatus(newStatus)
}

// ── วันที่ / เก็บงานเก่าเข้าคลัง ──
export const DAY_MS = 86_400_000

/** 'YYYY-MM-DD' วันนี้ตามเวลาไทย (UTC+7 ไม่มี DST) */
export function bangkokToday(nowMs: number): string {
  return new Date(nowMs + 7 * 3_600_000).toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' + n วัน (ลบได้) */
export function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
}

export const STALE_CLOSED_STATUSES = ['rejected', 'ปิด']
export const STALE_CLOSED_DAYS = 90
export const STALE_COLD_DAYS = 180

export type StaleRow = { id: string; status: string; updated_at: string | null; created_at: string; event_date: string | null }

/**
 * งานเก่าที่ควรเก็บเข้าคลัง (แถวที่ส่งเข้ามาต้องเป็นงานที่ยังไม่เก็บเท่านั้น)
 * closed = ปฏิเสธ/ปิด และไม่ถูกแตะเกิน 90 วัน · cold = ลูกค้าใหม่ ไม่มีวันงาน (หรือวันงานผ่านไปแล้ว) และไม่ถูกแตะเกิน 180 วัน
 */
export function staleLeadIds(rows: StaleRow[], nowMs: number): { closed: string[]; cold: string[] } {
  const today = bangkokToday(nowMs)
  const closed: string[] = []
  const cold: string[] = []
  for (const r of rows) {
    const age = nowMs - Date.parse(r.updated_at ?? r.created_at)
    if (STALE_CLOSED_STATUSES.includes(r.status)) {
      if (age > STALE_CLOSED_DAYS * DAY_MS) closed.push(r.id)
    } else if (r.status === 'lead' && (!r.event_date || r.event_date.slice(0, 10) < today) && age > STALE_COLD_DAYS * DAY_MS) {
      cold.push(r.id)
    }
  }
  return { closed, cold }
}

export interface CrmLead {
  id: string
  created_at: string
  updated_at: string
  created_by: string | null
  status: LeadStatus
  is_returning: boolean
  customer_name: string
  customer_line: string | null
  customer_phone: string | null
  customer_type: string | null
  work_type: string | null // 'sale' | 'event' | 'gp'
  unit_count?: number | null // จำนวนตู้ — ใช้เฉพาะงานขาย (ไม่มีคอลัมน์ถ้ายังไม่รัน migration 20260928)
  lead_source: string | null
  event_date: string | null
  event_end_date: string | null
  event_time: string | null // HH:mm[:ss]
  event_end_time: string | null // HH:mm[:ss]
  event_days: number
  event_location: string | null
  event_details: string | null
  required_roles: Record<string, number> // { "<staff_role>": จำนวนคน } — {} = ยังไม่กำหนด
  package_name: string | null
  quoted_price: number
  confirmed_price: number
  deposit: number
  installment_1: number
  installment_2: number
  installment_3: number
  installment_4: number
  installment_1_date: string | null
  installment_2_date: string | null
  installment_3_date: string | null
  installment_4_date: string | null
  installment_1_paid: boolean
  installment_2_paid: boolean
  installment_3_paid: boolean
  installment_4_paid: boolean
  installment_1_paid_date: string | null
  installment_2_paid_date: string | null
  installment_3_paid_date: string | null
  installment_4_paid_date: string | null
  vat_mode: string // 'none' | 'included' | 'excluded'
  wht_rate: number // 0 | 1 | 2 | 3 | 5
  quotation_ref: string | null
  notes: string | null
  tags: string[]
  archived_at: string | null
  assigned_sales: string[]
  assigned_graphics: string[]
  assigned_staff: string[]
  total_installments_paid: number
}

export interface CrmSetting {
  id: string
  category: string
  value: string
  label_th: string
  label_en: string
  color: string | null
  price: number | null
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}


// ── คอลัมน์แบบเบาสำหรับบอร์ด/ตาราง/คลัง/แดชบอร์ด ──
// ไม่ดึง notes / required_roles / installment_N ฯลฯ — วิวที่ใช้ BoardLead อ่านคอลัมน์ที่ไม่ได้โหลดจะไม่ผ่าน tsc
export const BOARD_LEAD_KEYS = [
  'id', 'created_at', 'updated_at', 'status', 'is_returning', 'customer_name', 'customer_line', 'customer_phone',
  'customer_type', 'work_type', 'unit_count', 'lead_source', 'event_date', 'event_end_date', 'event_location',
  'event_details', 'package_name', 'quoted_price', 'confirmed_price', 'deposit', 'tags', 'archived_at',
  'assigned_sales', 'assigned_graphics', 'assigned_staff',
] as const satisfies readonly (keyof CrmLead)[]

export const BOARD_COLUMNS = `${BOARD_LEAD_KEYS.join(', ')}, crm_lead_installments(installment_number, amount, is_paid, due_date)`

/** งวดชำระจากตารางจริง (crm_lead_installments) — การ์ดใช้ทำป้ายเลยกำหนด/ใกล้กำหนด */
export type BoardInstallment = { installment_number: number; amount: number; is_paid: boolean; due_date: string | null }

export type BoardLead = Pick<CrmLead, (typeof BOARD_LEAD_KEYS)[number]> & { total_installments_paid: number; installments?: BoardInstallment[] }

/** ผู้ใช้ที่อนุมัติแล้ว (profiles) สำหรับเลือกเซลส์/กราฟิก/ทีมงาน */
export type SystemUser = { id: string; full_name: string | null; department: string | null }
