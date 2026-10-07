// ============================================================================
// แถบเลือกหลายใบ (คิวใบเบิก + ส่วนชำระเงินแล้ว) — มือถือติดขอบล่างเต็มความกว้าง · จอใหญ่ลอยมุมขวาล่าง
// แสดงผลล้วน ไม่มี hook · ผู้เรียกคำนวณว่าปุ่มไหนกดได้ (bulkEligible) และเรียก server action เอง
// ============================================================================

import { FileStack, Landmark, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BulkAction } from './lifecycle-actions'
import { PRIMARY_BUTTON } from './queue-row'

export interface BulkButton {
  action: BulkAction
  label: string
  primary?: boolean
  disabled: boolean
}

export interface QueueSelectionBarProps {
  count: number
  /** ป้ายของปุ่ม "เลือกทั้งหมด" พร้อมจำนวน เช่น 'เลือกทุกใบในกลุ่มนี้ (12)' */
  selectAllLabel: string
  selectAllDisabled: boolean
  bulk: BulkButton[]
  /** การกระทำที่กำลังทำงาน (ทุกปุ่มกดไม่ได้ระหว่างนั้น) */
  busy: BulkAction | 'bundle' | null
  /** เลือกเกิน BULK_MAX — ปุ่มทำทีละหลายใบกดไม่ได้ + คำแนะนำ */
  overBulkMax: boolean
  /** ถึงเพดานการเลือก (จับชุดเอกสาร) */
  atSelectLimit: boolean
  selectLimit: number
  isEn: boolean
  onSelectAll: () => void
  onClear: () => void
  onExit: () => void
  onBulk: (action: BulkAction) => void
  onBundle: () => void
  /** ปิดใบ: เคลียร์กับสำนักงานบัญชีแล้ว (admin) */
  onCloseExternal?: () => void
}

export function QueueSelectionBar({
  count, selectAllLabel, selectAllDisabled, bulk, busy, overBulkMax, atSelectLimit, selectLimit, isEn,
  onSelectAll, onClear, onExit, onBulk, onBundle, onCloseExternal,
}: QueueSelectionBarProps) {
  return (
    <div
      role="region"
      aria-label={isEn ? 'Selected claims' : 'ใบเบิกที่เลือก'}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] md:inset-x-auto md:right-6 md:bottom-6 md:max-w-[calc(100vw-244px-3rem)] md:rounded-2xl md:border md:pb-0 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div className="space-y-2 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="mr-auto text-sm font-semibold text-zinc-900 dark:text-zinc-100" aria-live="polite">
            {isEn ? `${count} selected` : `เลือกแล้ว ${count} ใบ`}
          </p>
          <Button size="lg" type="button" variant="ghost" className="px-3" onClick={onSelectAll} disabled={selectAllDisabled || !!busy}>
            {selectAllLabel}
          </Button>
          <Button size="lg" type="button" variant="ghost" className="px-3" onClick={onClear} disabled={count === 0 || !!busy}>
            {isEn ? 'Clear selection' : 'ล้างที่เลือก'}
          </Button>
          <Button size="lg" type="button" variant="ghost" className="px-3" onClick={onExit} disabled={!!busy}>
            <X aria-hidden="true" />
            {isEn ? 'Exit selection' : 'ออกจากโหมดเลือก'}
          </Button>
        </div>
        {/* จอแคบ: ปุ่มเรียงแถวเดียวเลื่อนแนวนอนในแถบ (หน้าไม่เลื่อน) · จอใหญ่ขึ้นบรรทัดใหม่ได้ */}
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {bulk.map(b => (
            <Button size="lg" key={b.action} type="button" variant={b.primary ? 'default' : 'outline'} disabled={b.disabled || overBulkMax || !!busy}
              onClick={() => onBulk(b.action)}
              className={cn('shrink-0 px-4', b.primary && PRIMARY_BUTTON)}
            >
              {busy === b.action && <Loader2 className="animate-spin" aria-hidden="true" />}
              {b.label}
            </Button>
          ))}
          <Button size="lg" type="button" variant="outline" className="shrink-0 px-4" onClick={onBundle} disabled={count === 0 || !!busy}>
            <FileStack aria-hidden="true" />
            {isEn ? 'Bundle documents' : 'จับชุดเอกสาร'}
          </Button>
          {onCloseExternal && (
            <Button size="lg" type="button" variant="outline" className="shrink-0 px-4" onClick={onCloseExternal} disabled={count === 0 || overBulkMax || !!busy}>
              <Landmark aria-hidden="true" />
              {isEn ? 'Close with accountant' : 'ปิดกับสำนักงานบัญชี'}
            </Button>
          )}
        </div>
        {(overBulkMax || atSelectLimit) && (
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200" role="status">
            {overBulkMax && (isEn ? 'Up to 50 claims per action' : 'ทำได้ครั้งละไม่เกิน 50 ใบ')}
            {overBulkMax && atSelectLimit && ' · '}
            {atSelectLimit && (isEn ? `Up to ${selectLimit} claims can be selected` : `เลือกได้ครั้งละไม่เกิน ${selectLimit} ใบ`)}
          </p>
        )}
      </div>
    </div>
  )
}
