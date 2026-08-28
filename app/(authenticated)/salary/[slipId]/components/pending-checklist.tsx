'use client'

// ============================================================================
// checklist "งานค้างก่อนปิดงวด" — spec: docs/specs/salary-slip-daily-ui.md
//
// จัดกลุ่มตามชนิดคำเตือน คลิกรายการแล้วเลื่อนไปแถววันนั้นในตาราง + ไฮไลต์ 2 วิ
// คำเตือนที่ยอมรับได้ (ทุกชนิดยกเว้นรันเนอร์ที่ยังไม่กรอก) กด "ยอมรับ" แล้วไม่นับ
// เป็นงานค้างอีก แต่ยังแสดงจางๆ พร้อมลิงก์ถอนการยอมรับ
//
// แสดงเฉพาะ admin + สลิปร่าง — ตัวเรียกส่ง editable เข้ามา (server ตรวจซ้ำทุก action)
// ============================================================================

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check, ChevronRight, CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatThaiDate } from '@/lib/thai-date'
import { acceptSlipWarning, unacceptSlipWarning, type SlipDetail } from '../../actions'
import { pendingItems, pendingKey, type AcceptedWarning } from '../../compute'

interface Props {
  slip: SlipDetail
  /** admin + สลิปร่างเท่านั้น — false = ไม่แสดง checklist เลย */
  editable: boolean
  /** คลิกรายการ → เลื่อนไปแถววันนั้น */
  onJump: (date: string) => void
  /** สลิปที่อัปเดตรายการยอมรับแล้ว — ตัวเรียกเก็บไว้ใน state เพื่อให้ยอดค้างขยับทันที */
  onSlipChange: (slip: SlipDetail) => void
}

/** ยอมรับไม่ได้ — รันเนอร์ต้องกรอกยอด (พิมพ์ 0 ได้) ตรงกับกติกาใน compute.ts/actions.ts */
const NOT_ACCEPTABLE = 'runner_missing'

export default function PendingChecklist({ slip, editable, onJump, onSlipChange }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const pending = pendingItems(slip.warnings, slip.accepted_warnings, slip.lines)
  const acceptedCount = pending.groups.reduce(
    (sum, g) => sum + g.items.filter(i => i.accepted).length,
    0
  )

  // ข้อความสั้นของแต่ละรายการมาจากคำเตือนต้นทาง (รันเนอร์ไม่มีคำเตือน → ใช้ป้ายกลุ่มแทน)
  const messageByKey = new Map(
    slip.warnings.map(w => [pendingKey(w.code, w.date, w.checkin_id), w.message])
  )

  if (!editable) return null
  if (pending.count === 0 && acceptedCount === 0) return null

  function setAccepted(next: AcceptedWarning[]) {
    onSlipChange({ ...slip, accepted_warnings: next })
  }

  function accept(key: string) {
    setBusyKey(key)
    startTransition(async () => {
      const res = await acceptSlipWarning(slip.id, key)
      setBusyKey(null)
      if (res.error) {
        toast.error(res.error)
        return
      }
      // ยอดค้างบนหัวสลิปต้องขยับทันที — action คืนแค่ success จึงเติมรายการเองฝั่ง client
      setAccepted([...slip.accepted_warnings, { key, by: '', at: new Date().toISOString() }])
    })
  }

  function unaccept(key: string) {
    setBusyKey(key)
    startTransition(async () => {
      const res = await unacceptSlipWarning(slip.id, key)
      setBusyKey(null)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setAccepted(slip.accepted_warnings.filter(a => a.key !== key))
    })
  }

  // เคลียร์หมดแล้วแต่มีรายการที่ "ยอมรับ" ไว้ — เหลือบรรทัดสรุปสั้นๆ พอให้รู้ว่ามีอยู่
  if (pending.count === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-500" />
        ไม่มีงานค้าง · ยอมรับแล้ว {acceptedCount} ข้อ
      </div>
    )
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
      <p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-400">
        <AlertTriangle className="size-4" />
        งานค้างก่อนปิดงวด {pending.count} รายการ
        {acceptedCount > 0 && (
          <span className="font-normal text-amber-700/80 dark:text-amber-500/80">
            · ยอมรับแล้ว {acceptedCount} ข้อ
          </span>
        )}
      </p>

      <div className="mt-2 space-y-2">
        {pending.groups.map(group => (
          <div key={group.code}>
            <p className="text-xs font-medium text-amber-700 dark:text-amber-500">
              {group.label} {group.items.length} รายการ
            </p>
            <ul className="mt-1 space-y-0.5">
              {group.items.map(item => {
                const message = messageByKey.get(item.key) || group.label
                const busy = busyKey === item.key
                return (
                  <li
                    key={item.key}
                    className={cn(
                      'flex flex-wrap items-center gap-x-2 gap-y-1 rounded px-1 py-0.5 text-sm',
                      item.accepted
                        ? 'text-muted-foreground line-through decoration-muted-foreground/60'
                        : 'text-amber-800 dark:text-amber-400'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onJump(item.date)}
                      className="inline-flex min-w-0 items-center gap-1 text-left hover:underline"
                    >
                      <ChevronRight className="size-3.5 shrink-0" />
                      <span className="shrink-0 tabular-nums">{formatThaiDate(item.date)}</span>
                      <span className="truncate opacity-90">· {message}</span>
                    </button>

                    {group.code !== NOT_ACCEPTABLE && (
                      item.accepted ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => unaccept(item.key)}
                          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                        >
                          ยกเลิกการยอมรับ
                        </button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          disabled={busy}
                          onClick={() => accept(item.key)}
                        >
                          <Check className="size-3" />
                          ยอมรับ
                        </Button>
                      )
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
