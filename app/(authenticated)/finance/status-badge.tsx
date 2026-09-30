// ============================================================================
// ป้ายสถานะใบเบิก — ที่เดียวที่ให้สีของสถานะ (หนึ่งความหมาย หนึ่งสี) พร้อมไอคอน ไม่พึ่งสีอย่างเดียว
// สีเป็นคู่ที่อ่านได้ (AA): สว่าง text-*-800 บน bg-*-100 · มืด text-*-200 บน bg-*-950/60
// ไม่มี hook — ใช้ได้ทั้ง server component, client component และในชุดตรวจ renderToStaticMarkup
// ============================================================================

import {
  Ban, Banknote, CalendarClock, CheckCircle2, Clock, FileEdit, Receipt, RefreshCw, XCircle, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getClaimStatusLabel } from '../costs/types'

/** คลาสเต็มทุกตัว (Tailwind อ่านคลาสจากซอร์ส — ห้ามประกอบชื่อสีจากตัวแปร) */
const STATUS_STYLE: Record<string, { tone: string; Icon: LucideIcon }> = {
  draft: { tone: 'text-zinc-800 bg-zinc-100 dark:text-zinc-200 dark:bg-zinc-950/60', Icon: FileEdit },
  pending: { tone: 'text-amber-800 bg-amber-100 dark:text-amber-200 dark:bg-amber-950/60', Icon: Clock },
  approved: { tone: 'text-emerald-800 bg-emerald-100 dark:text-emerald-200 dark:bg-emerald-950/60', Icon: CheckCircle2 },
  waiting_tax_invoice: { tone: 'text-sky-800 bg-sky-100 dark:text-sky-200 dark:bg-sky-950/60', Icon: Receipt },
  pending_month_end: { tone: 'text-violet-800 bg-violet-100 dark:text-violet-200 dark:bg-violet-950/60', Icon: CalendarClock },
  paid: { tone: 'text-teal-800 bg-teal-100 dark:text-teal-200 dark:bg-teal-950/60', Icon: Banknote },
  refund_confirmed: { tone: 'text-cyan-800 bg-cyan-100 dark:text-cyan-200 dark:bg-cyan-950/60', Icon: RefreshCw },
  rejected: { tone: 'text-red-800 bg-red-100 dark:text-red-200 dark:bg-red-950/60', Icon: XCircle },
  cancelled: { tone: 'text-zinc-800 bg-zinc-100 dark:text-zinc-200 dark:bg-zinc-950/60', Icon: Ban },
  // ข้อมูลเก่า — โค้ดใหม่ไม่สร้างสถานะนี้แล้ว ความหมายเดียวกับ "อนุมัติแล้ว"
  awaiting_payment: { tone: 'text-emerald-800 bg-emerald-100 dark:text-emerald-200 dark:bg-emerald-950/60', Icon: CheckCircle2 },
}

export function StatusBadge({ status, isEn, className }: { status: string; isEn: boolean; className?: string }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.draft
  const Icon = style.Icon
  return (
    <span
      data-status={status}
      className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap', style.tone, className)}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {getClaimStatusLabel(status, isEn ? 'en' : 'th')}
    </span>
  )
}
