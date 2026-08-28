// ============================================================================
// ป้ายสถานะสลิป — ใช้ร่วมกันระหว่างตารางสลิปในงวดและหน้าสลิป
// สีเดียวกับที่หน้ารายการงวดใช้นับสถานะ (runs-view.tsx)
// ============================================================================

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { SlipStatus } from '../actions'

export const SLIP_STATUS_LABEL: Record<SlipStatus, string> = {
  draft: 'ร่าง',
  finalized: 'ปิดงวดแล้ว',
  paid: 'จ่ายแล้ว',
}

const SLIP_STATUS_CLASS: Record<SlipStatus, string> = {
  draft: '',
  finalized:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-500',
  paid:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400',
}

export function SlipStatusBadge({ status, className }: { status: SlipStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(SLIP_STATUS_CLASS[status], className)}>
      {SLIP_STATUS_LABEL[status]}
    </Badge>
  )
}
