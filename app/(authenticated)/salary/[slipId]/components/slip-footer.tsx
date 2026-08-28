'use client'

// ============================================================================
// ท้ายสลิป: เงินเดือนฐาน · รายการปรับมือ (เพิ่ม/ลบในแถว) · ยอดสุทธิ
// spec: docs/specs/salary-slip-daily-ui.md §"มุมมองรายวัน" (ท้ายตาราง)
//
// ตรรกะชุดเดียว ใช้ได้สองหน้าตา (ตัวเรียกเลือกด้วย `variant`):
//   'table'   → <tfoot> ของตารางเดสก์ท็อป (คอลัมน์ป้ายกินทั้งแถว ยอดชิดขวา)
//   'stacked' → บล็อกเรียงแนวตั้งใต้การ์ดรายวันบนมือถือ
// ============================================================================

import { useState, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { fmtMoney } from '../../format'
import {
  addSlipAdjustment, removeSlipAdjustment, type SlipDetail,
} from '../../actions'

export type FooterVariant = 'table' | 'stacked'

interface Props {
  slip: SlipDetail
  /** admin + สลิปร่างเท่านั้น — false = ไม่มีปุ่มเพิ่ม/ลบรายการปรับมือ */
  editable: boolean
  onSlipChange: (slip: SlipDetail) => void
  variant: FooterVariant
  /** จำนวนคอลัมน์ของตาราง — ใช้กับ colSpan เมื่อ variant = 'table' */
  columns?: number
}

export default function SlipFooter({
  slip, editable, onSlipChange, variant, columns = 10,
}: Props) {
  const rowProps = { variant, columns }

  const rows = (
    <>
      {/* ฟรีแลนซ์ไม่มีเงินเดือนฐาน — สลิปเก่าที่เก็บฐานติดมาก็ห้ามโชว์
          (ยอดสุทธิไม่ได้รวมฐานไว้ ถ้าโชว์บรรทัดนี้ตัวเลขจะบวกไม่ลง) */}
      {slip.employment_type !== 'freelance' && slip.base_salary > 0 && (
        <FooterRow
          {...rowProps}
          rowClass="border-t"
          labelClass="px-3 py-2.5 font-medium"
          valueClass="px-3 py-2.5 text-right font-medium tabular-nums"
          label="เงินเดือนฐาน"
          value={fmtMoney(slip.base_salary)}
        />
      )}

      {slip.adjustments.map((a, i) => (
        <FooterRow
          key={a.id || `adj-${i}`}
          {...rowProps}
          rowClass="border-t"
          labelClass="px-3 py-2 text-muted-foreground"
          valueClass="px-3 py-2 text-right tabular-nums"
          label={`รายการปรับมือ · ${a.label || '(ไม่มีชื่อรายการ)'}`}
          value={
            <span className="inline-flex items-center justify-end gap-1">
              <span className={Number(a.amount || 0) < 0 ? 'text-red-600 dark:text-red-400' : ''}>
                {fmtMoney(a.amount)}
              </span>
              {editable && (
                <RemoveAdjustmentButton
                  slipId={slip.id}
                  adjustmentId={a.id}
                  label={a.label}
                  onSlipChange={onSlipChange}
                />
              )}
            </span>
          }
        />
      ))}

      {editable && (
        <AddAdjustmentRow
          slipId={slip.id}
          onSlipChange={onSlipChange}
          variant={variant}
          columns={columns}
        />
      )}

      <FooterRow
        {...rowProps}
        rowClass="border-t bg-muted/60"
        labelClass="px-3 py-3 font-semibold"
        valueClass="px-3 py-3 text-right text-base font-semibold tabular-nums"
        label="ยอดสุทธิ"
        value={fmtMoney(slip.total)}
      />
    </>
  )

  if (variant === 'table') return <tfoot>{rows}</tfoot>
  return <div className="overflow-hidden rounded-md border">{rows}</div>
}

// ────────────────────────────────────────────────────────────────────────────
// แถวเดียวของท้ายสลิป — ป้ายซ้าย ยอดขวา (แถวตาราง หรือ แถบ flex)
// ────────────────────────────────────────────────────────────────────────────

interface FooterRowProps {
  variant: FooterVariant
  columns: number
  rowClass?: string
  labelClass?: string
  valueClass?: string
  label: ReactNode
  value: ReactNode
}

function FooterRow({
  variant, columns, rowClass, labelClass, valueClass, label, value,
}: FooterRowProps) {
  if (variant === 'table') {
    return (
      <tr className={rowClass}>
        <td colSpan={columns - 1} className={labelClass}>{label}</td>
        <td className={valueClass}>{value}</td>
      </tr>
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-3 gap-y-1', rowClass)}>
      <div className={cn('min-w-0 text-sm', labelClass)}>{label}</div>
      <div className={cn('text-sm', valueClass)}>{value}</div>
    </div>
  )
}

/** เพิ่มรายการปรับมือในแถว — จำนวนติดลบได้ (หัก) แต่เป็นศูนย์ไม่ได้ */
function AddAdjustmentRow({
  slipId, onSlipChange, variant, columns,
}: {
  slipId: string
  onSlipChange: (slip: SlipDetail) => void
  variant: FooterVariant
  columns: number
}) {
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [isPending, startTransition] = useTransition()

  function add() {
    const value = Number(amount)
    if (!label.trim()) { toast.error('กรุณาระบุชื่อรายการ'); return }
    if (amount.trim() === '' || !Number.isFinite(value) || value === 0) {
      toast.error('จำนวนเงินต้องเป็นตัวเลขที่ไม่ใช่ศูนย์')
      return
    }
    startTransition(async () => {
      const res = await addSlipAdjustment(slipId, label, value)
      if (res.error) {
        toast.error(res.error)
        return
      }
      if (res.slip) onSlipChange(res.slip)
      setLabel('')
      setAmount('')
    })
  }

  return (
    <FooterRow
      variant={variant}
      columns={columns}
      rowClass="border-t"
      labelClass="px-3 py-2"
      valueClass="px-3 py-2 text-right"
      label={
        <Input
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="เพิ่มรายการปรับมือ เช่น โบนัส / หักประกันสังคม"
          aria-label="ชื่อรายการปรับมือ"
          className="h-8 max-w-96"
        />
      }
      value={
        <span className="inline-flex items-center justify-end gap-1">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder="± จำนวน"
            aria-label="จำนวนเงินของรายการปรับมือ"
            className="h-8 w-28 text-right tabular-nums"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            disabled={isPending}
            onClick={add}
            title="เพิ่มรายการปรับมือ"
          >
            <Plus className="size-4" />
          </Button>
        </span>
      }
    />
  )
}

function RemoveAdjustmentButton({
  slipId, adjustmentId, label, onSlipChange,
}: {
  slipId: string
  adjustmentId: string
  label: string
  onSlipChange: (slip: SlipDetail) => void
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={isPending}
      title={`ลบรายการ ${label}`}
      aria-label={`ลบรายการ ${label}`}
      onClick={() =>
        startTransition(async () => {
          const res = await removeSlipAdjustment(slipId, adjustmentId)
          if (res.error) {
            toast.error(res.error)
            return
          }
          if (res.slip) onSlipChange(res.slip)
        })
      }
      className="rounded p-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
    >
      <X className="size-3.5" />
    </button>
  )
}
