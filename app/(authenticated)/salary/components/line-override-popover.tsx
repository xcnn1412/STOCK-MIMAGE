'use client'

// ============================================================================
// แก้มือทับหนึ่งบรรทัดของสลิปร่าง — ตัวเลข + เหตุผล (บังคับทุกชนิดยกเว้นรันเนอร์)
// ใช้เฉพาะเมื่อ admin เปิดสลิปที่ยังเป็นร่าง (ตัวเรียกเป็นคนตัดสินใจว่าจะ render ไหม
// — ฝั่ง server ตรวจสิทธิ์ + สถานะซ้ำอยู่แล้วในทุก action)
// ============================================================================

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { fmtMoney } from '../format'
import { clearSlipLineOverride, overrideSlipLine } from '../actions'
import type { SalaryLine } from '../compute'

interface Props {
  slipId: string
  line: SalaryLine
}

export default function LineOverridePopover({ slipId, line }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [isPending, startTransition] = useTransition()

  const overridden = !!line.override_note?.trim()

  /** เปิดทีไรโหลดค่าล่าสุดของบรรทัดเข้าฟอร์มใหม่ (ไม่ค้างค่าจากรอบก่อน) */
  function handleOpenChange(next: boolean) {
    if (next) {
      setAmount(String(line.amount ?? line.computed_amount ?? 0))
      setNote(line.override_note || '')
    }
    setOpen(next)
  }

  function save() {
    const value = Number(amount)
    if (!Number.isFinite(value) || value < 0) {
      toast.error('จำนวนเงินต้องเป็นตัวเลขไม่ติดลบ')
      return
    }
    if (!note.trim()) {
      toast.error('กรุณาระบุเหตุผลของการแก้มือ')
      return
    }
    startTransition(async () => {
      const res = await overrideSlipLine(slipId, line.key, value, note)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setOpen(false)
      toast.success('แก้มือบรรทัดนี้แล้ว')
      router.refresh()
    })
  }

  function clear() {
    startTransition(async () => {
      const res = await clearSlipLineOverride(slipId, line.key)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setOpen(false)
      toast.success('คืนค่าที่ระบบคำนวณแล้ว')
      router.refresh()
    })
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          title={overridden ? 'แก้ค่าที่แก้มือไว้' : 'แก้มือทับบรรทัดนี้'}
        >
          <Pencil className="size-3.5" />
          แก้มือ
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 space-y-3">
        <div>
          <p className="text-sm font-medium">แก้มือทับบรรทัด</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            ระบบคำนวณได้ {fmtMoney(line.computed_amount)} บาท — ค่าที่แก้จะไม่ถูกทับตอนคำนวณใหม่
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`override-amount-${line.key}`} className="text-xs">
            จำนวนเงิน (บาท)
          </Label>
          <Input
            id={`override-amount-${line.key}`}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="tabular-nums"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`override-note-${line.key}`} className="text-xs">
            เหตุผล (บังคับ)
          </Label>
          <Textarea
            id={`override-note-${line.key}`}
            rows={2}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="เช่น ตกลงอัตราพิเศษกับพนักงาน"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          {overridden ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={clear}
              className="text-xs text-muted-foreground"
            >
              <RotateCcw className="size-3.5" />
              คืนค่าเดิม
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" size="sm" disabled={isPending} onClick={save}>
            บันทึก
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
