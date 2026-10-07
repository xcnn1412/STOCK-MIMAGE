// ชิปสถานะใบจัดของ + ป้ายสภาพตอนคืน — ใช้ร่วมกันในคิว /packing, หน้าใบ, หน้าจุดรับของ และช่อง "จัดของ" ในหน้าติดตามงาน (ไม่มี state ใช้ได้ทั้ง server/client)
import { ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PACKING_STATUS_LABELS, RETURN_CONDITION_LABELS } from './packing-logic'
import type { PackingStatus, ReturnCondition } from './types'

const TONE: Record<PackingStatus, string> = {
  selecting: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  picking: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100',
  ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  out: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  returned: 'bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200',
  done: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

/** ป้ายสถานะใบ + "หยิบแล้ว x/y" ตอนกำลังหยิบ */
export function packingChipText(status: PackingStatus, picked?: number, total?: number): string {
  const label = PACKING_STATUS_LABELS[status] ?? status
  return status === 'picking' && total ? `${label} · หยิบแล้ว ${picked ?? 0}/${total}` : label
}

export function PackingStatusChip({ status, picked, total, className }: { status: PackingStatus; picked?: number; total?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium', TONE[status] ?? TONE.done, className)}>
      <ClipboardList className="h-3.5 w-3.5 shrink-0" />
      {packingChipText(status, picked, total)}
    </span>
  )
}

const CONDITION_TONE: Record<ReturnCondition, string> = {
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  damaged: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  maintenance: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  lost: 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900',
}

/** ป้ายสภาพตอนคืนของ (ใช้ได้ / เสียหาย / ซ่อม / หาย) — ยังไม่คืน (null) ไม่แสดง */
export function ReturnConditionBadge({ condition, className }: { condition: ReturnCondition | null | undefined; className?: string }) {
  if (!condition) return null
  return (
    <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium', CONDITION_TONE[condition] ?? CONDITION_TONE.damaged, className)}>
      {RETURN_CONDITION_LABELS[condition] ?? condition}
    </span>
  )
}
