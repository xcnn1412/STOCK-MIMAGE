'use client'

// ============================================================================
// ตารางบรรทัดของสลิป — เงินเดือนฐาน + บรรทัดที่คำนวณ (จัดกลุ่มตามวัน) +
// รายการปรับมือ + ยอดสุทธิ
//
// โหมดแก้ไข (`editable`) เปิดเฉพาะ admin + สลิปร่าง: แก้มือทับบรรทัด, กรอกยอด
// รันเนอร์, เพิ่ม/ลบรายการปรับมือ — ยอดรวมคำนวณใหม่ที่ server ทุกครั้ง หน้านี้แค่
// router.refresh() ตาม (ไม่คิดยอดเองฝั่ง client จะได้ไม่มีสองแหล่งความจริง)
// ============================================================================

import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatThaiDate } from '@/lib/thai-date'
import { LINE_KIND_LABEL, fmtMoney } from '../format'
import { addSlipAdjustment, clearSlipLineOverride, overrideSlipLine, removeSlipAdjustment } from '../actions'
import { lineAmount, type EmploymentType, type LineKind, type SalaryAdjustment, type SalaryLine } from '../compute'
import LineOverridePopover from './line-override-popover'

const KIND_CLASS: Record<LineKind, string> = {
  ot: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  site: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  oop: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
  runner: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400',
}

interface Props {
  lines: SalaryLine[]
  adjustments: SalaryAdjustment[]
  employmentType: EmploymentType
  baseSalary: number
  total: number
  /** ต้องส่งมาคู่กับ editable — ทุก action ใช้ id นี้ */
  slipId?: string
  /** admin + สลิปร่างเท่านั้น (server ตรวจซ้ำอยู่ดี) */
  editable?: boolean
}

/** บรรทัดที่ยังไม่กรอกยอด (รันเนอร์) — นับเป็น 0 ในยอดรวมแต่ปิดงวดไม่ได้ */
function isMissing(l: SalaryLine): boolean {
  return l.amount === null || l.amount === undefined
}

export default function SlipLinesTable({
  lines, adjustments, employmentType, baseSalary, total, slipId, editable,
}: Props) {
  // จัดกลุ่มตามวัน โดยคงลำดับที่เครื่องคำนวณเรียงมาแล้ว (วัน → ชนิด → label)
  const groups: { date: string; lines: SalaryLine[] }[] = []
  for (const line of lines) {
    const last = groups[groups.length - 1]
    if (last && last.date === line.date) last.lines.push(line)
    else groups.push({ date: line.date, lines: [line] })
  }

  const adjustTotal = adjustments.reduce((sum, a) => sum + Number(a.amount || 0), 0)
  const canEdit = !!editable && !!slipId

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-130 text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">รายการ</th>
            <th className="px-4 py-2 text-right font-medium">จำนวน (บาท)</th>
          </tr>
        </thead>

        <tbody>
          {/* เงินเดือนฐาน — เฉพาะพนักงานประจำ (ฟรีแลนซ์ไม่มีบรรทัดนี้) */}
          {employmentType !== 'freelance' && (
            <tr className="border-b">
              <td className="px-4 py-2.5 font-medium">เงินเดือนฐาน</td>
              <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                {fmtMoney(baseSalary)}
              </td>
            </tr>
          )}

          {groups.length === 0 && (
            <tr className="border-b">
              <td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">
                ไม่มีรายการจากเช็คอินในงวดนี้
              </td>
            </tr>
          )}

          {groups.map(g => (
            <Fragment key={g.date}>
              <tr className="border-b bg-muted/40">
                <td colSpan={2} className="px-4 py-1.5 text-xs font-medium text-muted-foreground">
                  {formatThaiDate(g.date)}
                </td>
              </tr>
              {g.lines.map(l => (
                <tr key={l.key} className="border-b">
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND_CLASS[l.kind]}`}
                      >
                        {LINE_KIND_LABEL[l.kind]}
                      </span>
                      <span>{l.label}</span>
                    </div>
                    {l.override_note && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        แก้มือ: {l.override_note}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <div className="flex items-center justify-end gap-2">
                      {canEdit && l.kind === 'runner' ? (
                        <RunnerAmountCell slipId={slipId!} line={l} />
                      ) : (
                        <>
                          <LineAmount line={l} />
                          {canEdit && <LineOverridePopover slipId={slipId!} line={l} />}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}

          {/* รายการปรับมือ — โบนัส/หัก ที่ admin เพิ่มเอง (± ได้) */}
          {(adjustments.length > 0 || canEdit) && (
            <>
              <tr className="border-b bg-muted/40">
                <td colSpan={2} className="px-4 py-1.5 text-xs font-medium text-muted-foreground">
                  รายการปรับมือ
                </td>
              </tr>
              {adjustments.map((a, i) => (
                <tr key={a.id || `adj-${i}`} className="border-b">
                  <td className="px-4 py-2.5">{a.label || '(ไม่มีชื่อรายการ)'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className={Number(a.amount || 0) < 0 ? 'text-red-600 dark:text-red-400' : ''}
                      >
                        {fmtMoney(a.amount)}
                      </span>
                      {canEdit && <RemoveAdjustmentButton slipId={slipId!} adjustment={a} />}
                    </div>
                  </td>
                </tr>
              ))}
              {canEdit && (
                <tr className="border-b">
                  <td colSpan={2} className="px-4 py-2.5">
                    <AddAdjustmentForm slipId={slipId!} />
                  </td>
                </tr>
              )}
              {adjustments.length > 0 && (
                <tr className="border-b">
                  <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                    รวมรายการปรับมือ
                  </td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums text-muted-foreground">
                    {fmtMoney(adjustTotal)}
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>

        <tfoot>
          <tr className="bg-muted/60">
            <td className="px-4 py-3 font-semibold">ยอดสุทธิ</td>
            <td className="px-4 py-3 text-right text-base font-semibold tabular-nums">
              {fmtMoney(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** ตัวเลขของบรรทัด — ยังไม่กรอก / แก้มือแล้ว (โชว์ค่าเดิมขีดฆ่า) / ค่าที่ระบบคิด */
function LineAmount({ line }: { line: SalaryLine }) {
  if (isMissing(line)) {
    return (
      <span className="text-xs font-medium text-amber-600 dark:text-amber-500">ยังไม่กรอก</span>
    )
  }
  if (line.override_note) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-muted-foreground line-through">
          {fmtMoney(line.computed_amount)}
        </span>
        <span className="font-medium">{fmtMoney(lineAmount(line))}</span>
      </span>
    )
  }
  return <>{fmtMoney(lineAmount(line))}</>
}

/**
 * รันเนอร์กรอกยอดตรงในตาราง — เป็นการกรอกครั้งแรก ไม่ใช่การทับค่าที่ระบบคิด
 * จึงไม่บังคับเหตุผล (ใส่เหตุผลเพิ่มทีหลังได้ที่ป๊อปอัพแก้มือของบรรทัดอื่น)
 */
function RunnerAmountCell({ slipId, line }: { slipId: string; line: SalaryLine }) {
  const router = useRouter()
  const [value, setValue] = useState(line.amount === null || line.amount === undefined ? '' : String(line.amount))
  const [isPending, startTransition] = useTransition()

  const filled = !isMissing(line)

  function save() {
    const amount = Number(value)
    if (value.trim() === '' || !Number.isFinite(amount) || amount < 0) {
      toast.error('จำนวนเงินต้องเป็นตัวเลขไม่ติดลบ')
      return
    }
    startTransition(async () => {
      const res = await overrideSlipLine(slipId, line.key, amount, line.override_note || '')
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('บันทึกยอดรันเนอร์แล้ว')
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
      setValue('')
      toast.success('ล้างยอดรันเนอร์แล้ว')
      router.refresh()
    })
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save() }}
        placeholder="กรอกยอดรันเนอร์"
        aria-label={`กรอกยอดรันเนอร์ ${line.date}`}
        className="h-8 w-36 text-right tabular-nums"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        disabled={isPending}
        onClick={save}
        title="บันทึกยอดรันเนอร์"
      >
        <Check className="size-4" />
      </Button>
      {filled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground"
          disabled={isPending}
          onClick={clear}
          title="ล้างยอดที่กรอกไว้"
        >
          <RotateCcw className="size-4" />
        </Button>
      )}
    </div>
  )
}

/** เพิ่มรายการปรับมือ — จำนวนติดลบได้ (หัก) แต่เป็นศูนย์ไม่ได้ */
function AddAdjustmentForm({ slipId }: { slipId: string }) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [isPending, startTransition] = useTransition()

  function add() {
    const value = Number(amount)
    if (!label.trim()) {
      toast.error('กรุณาระบุชื่อรายการ')
      return
    }
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
      setLabel('')
      setAmount('')
      toast.success('เพิ่มรายการปรับมือแล้ว')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="ชื่อรายการ เช่น โบนัส / หักประกันสังคม"
        aria-label="ชื่อรายการปรับมือ"
        className="h-8 min-w-52 flex-1"
      />
      <Input
        type="number"
        inputMode="decimal"
        step="0.01"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') add() }}
        placeholder="± จำนวน"
        aria-label="จำนวนเงินของรายการปรับมือ"
        className="h-8 w-32 text-right tabular-nums"
      />
      <Button type="button" size="sm" className="h-8" disabled={isPending} onClick={add}>
        <Plus className="size-4" />
        เพิ่ม
      </Button>
    </div>
  )
}

function RemoveAdjustmentButton({
  slipId, adjustment,
}: { slipId: string; adjustment: SalaryAdjustment }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function remove() {
    startTransition(async () => {
      const res = await removeSlipAdjustment(slipId, adjustment.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('ลบรายการปรับมือแล้ว')
      router.refresh()
    })
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
      disabled={isPending}
      onClick={remove}
      title={`ลบรายการ ${adjustment.label}`}
    >
      <X className="size-4" />
    </Button>
  )
}
