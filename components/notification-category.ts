// ============================================================================
// Notification display helpers — หมวด, ไอคอน/สี/ป้ายชนิด, การแบ่งกลุ่มตามวัน
// ใช้ร่วมกันระหว่างหน้า /notifications, กระดิ่งแจ้งเตือน และ actions
// ============================================================================

export type NotificationCategory = 'jobs' | 'finance' | 'kpi' | 'crm' | 'documents' | 'salary' | 'other'

export const CATEGORY_ORDER: NotificationCategory[] = ['jobs', 'finance', 'kpi', 'crm', 'documents', 'salary', 'other']

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  jobs:    'งาน',
  finance: 'การเงิน',
  kpi:     'KPI',
  crm:     'CRM',
  documents: 'เอกสาร',
  salary:  'เงินเดือน',
  other:   'อื่นๆ',
}

/** prefix ของ type ในแต่ละหมวด — ใช้ทั้งจัดหมวดฝั่ง UI และกรองฝั่ง server */
export const CATEGORY_PREFIXES: Record<Exclude<NotificationCategory, 'other'>, string[]> = {
  jobs:    ['job_', 'ticket_'],
  finance: ['expense_'],
  kpi:     ['kpi_'],
  crm:     ['crm_'],
  documents: ['doc_'],
  salary:  ['salary_'],
}

export function categoryOf(type: string): NotificationCategory {
  for (const [cat, prefixes] of Object.entries(CATEGORY_PREFIXES)) {
    if (prefixes.some(p => type.startsWith(p))) return cat as NotificationCategory
  }
  return 'other'
}

// ── Type → icon tile + label (สไตล์เดียวกันทั้งหน้าเต็มและ dropdown) ──────────

export interface TypeConfig { icon: string; color: string; label: string }

export const TYPE_CONFIG: Record<string, TypeConfig> = {
  job_assigned:                { icon: '⭐', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',     label: 'งานใหม่' },
  job_status_changed:          { icon: '🔄', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',         label: 'สถานะงาน' },
  job_mentioned:               { icon: '📣', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', label: 'ถูกแท็ก' },
  job_comment:                 { icon: '💬', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',             label: 'ความคิดเห็น' },
  ticket_assigned:             { icon: '🎫', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', label: 'Ticket ใหม่' },
  ticket_reply:                { icon: '📝', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',         label: 'ตอบกลับ' },
  ticket_mentioned:            { icon: '📣', color: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400', label: 'ถูกแท็กใน Ticket' },
  ticket_status_changed:       { icon: '🔔', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',         label: 'สถานะ Ticket' },
  expense_approved:            { icon: '✅', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'อนุมัติแล้ว' },
  expense_rejected:            { icon: '❌', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',             label: 'ถูกปฏิเสธ' },
  expense_waiting_tax_invoice: { icon: '🧾', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',             label: 'รอใบกำกับภาษี' },
  expense_tax_invoice_uploaded:{ icon: '📤', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',         label: 'ใบกำกับภาษีเข้าแล้ว' },
  expense_refund_confirmed:    { icon: '💸', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',         label: 'ยืนยันคืนเงิน' },
  kpi_evaluated:               { icon: '📊', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', label: 'ผลประเมิน KPI' },
  kpi_self_evaluated:          { icon: '📝', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', label: 'ประเมินตัวเอง' },
  kpi_evaluation_reply:        { icon: '💬', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', label: 'ตอบกลับ KPI' },
  crm_mentioned:               { icon: '📍', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', label: 'ถูกแท็กใน CRM' },
  doc_pending_approval:        { icon: '📄', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',     label: 'เอกสารรออนุมัติ' },
  doc_approved:                { icon: '📗', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'เอกสารอนุมัติแล้ว' },
  doc_rejected:                { icon: '📕', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',             label: 'เอกสารถูกตีกลับ' },
  doc_voided:                  { icon: '🚫', color: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400', label: 'เอกสารถูกยกเลิก' },
  salary_finalized:            { icon: '💰', color: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400',        label: 'สลิปเงินเดือน' },
  salary_reopened:             { icon: '✏️', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', label: 'สลิปเงินเดือน' },
}

export const DEFAULT_TYPE_CONFIG: TypeConfig = {
  icon: '🔔', color: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400', label: 'การแจ้งเตือน',
}

// ── Day grouping (อิงวันตามเวลาไทย) ─────────────────────────────────────────

export type DayGroup = 'today' | 'yesterday' | 'week' | 'older'

export const DAY_ORDER: DayGroup[] = ['today', 'yesterday', 'week', 'older']

export const DAY_LABELS: Record<DayGroup, string> = {
  today:     'วันนี้',
  yesterday: 'เมื่อวาน',
  week:      '7 วันที่ผ่านมา',
  older:     'เก่ากว่านั้น',
}

const DAY_MS = 86_400_000

/** YYYY-MM-DD ตามโซนเวลา Asia/Bangkok (เรียงเทียบเป็น string ได้ตรงตัว) */
function bangkokDay(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

export function dayGroupOf(dateStr: string): DayGroup {
  const now = Date.now()
  const day = bangkokDay(new Date(dateStr))
  if (day === bangkokDay(new Date(now))) return 'today'
  if (day === bangkokDay(new Date(now - DAY_MS))) return 'yesterday'
  if (day >= bangkokDay(new Date(now - 7 * DAY_MS))) return 'week'
  return 'older'
}
