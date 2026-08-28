'use client'

// ============================================================================
// "เปิดแก้ไข" สลิปที่ปิดงวด/จ่ายแล้ว — spec §"เปิดแก้ไขหลังปิดงวด"
//
// บังคับเหตุผลยาวอย่างน้อย REOPEN_MIN_REASON ตัวอักษร (เกณฑ์เดียวกับ reopenSlip และ RPC)
// สลิปที่จ่ายไปแล้วมีกล่องเตือนเพิ่มว่าส่วนต่างต้องโอนเพิ่ม/หักคืนเอง
// ============================================================================

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatThaiDate } from '@/lib/thai-date'
import { fmtMoney } from '../../format'
import { reopenSlip, type SlipDetail } from '../../actions'
import { REOPEN_MIN_REASON } from '../../compute'

interface Props {
  slip: SlipDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ReopenDialog({ slip, open, onOpenChange }: Props) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const name = slip.full_name || slip.nickname || '(ไม่มีชื่อ)'
  const trimmed = reason.trim()
  const tooShort = trimmed.length < REOPEN_MIN_REASON
  const wasPaid = slip.status === 'paid'

  function submit() {
    startTransition(async () => {
      const res = await reopenSlip(slip.id, trimmed)
      if (res.error) {
        toast.error(res.error)
        return
      }
      onOpenChange(false)
      setReason('')
      toast.success('เปิดสลิปกลับมาแก้ไขแล้ว — แก้เสร็จอย่าลืมปิดงวดใหม่')
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={v => { if (!isPending) onOpenChange(v) }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>เปิดแก้ไขสลิปของ{name}</DialogTitle>
          <DialogDescription>
            สลิปจะกลับเป็นร่างทั้งใบ เช็คอินในงวดถูกปลดประทับ และ{name}จะมองไม่เห็นสลิป
            จนกว่าจะปิดงวดใหม่ (ระบบแจ้งเตือนให้อัตโนมัติ)
          </DialogDescription>
        </DialogHeader>

        {wasPaid && (
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              สลิปนี้จ่ายไปแล้ว {fmtMoney(slip.paid_total ?? slip.total)} บาท
              {slip.paid_at ? ` เมื่อ ${formatThaiDate(slip.paid_at)}` : ''} —
              หลังปิดงวดใหม่ระบบจะแสดงส่วนต่างให้ ต้องโอนเพิ่ม/หักคืนเอง
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="reopen-reason" className="text-sm font-medium">
            เหตุผลที่เปิดแก้ไข
          </label>
          <Textarea
            id="reopen-reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="เช่น เวลาออกของวันที่ 12 ผิด ต้องแก้เป็น 20:30"
            rows={3}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            {trimmed.length}/{REOPEN_MIN_REASON} ตัวอักษร
            {tooShort ? ` · ต้องยาวอย่างน้อย ${REOPEN_MIN_REASON} ตัวอักษร` : ' · ครบแล้ว'}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            ยกเลิก
          </Button>
          <Button disabled={isPending || tooShort} onClick={submit}>
            เปิดแก้ไข
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
