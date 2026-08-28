'use client'

// ============================================================================
// "เพิ่มเช็คอินที่ลืม" — spec: docs/specs/salary-slip-daily-ui.md §"มุมมองรายวัน"
//
// ตรรกะชุดเดียว ใช้ได้สองหน้าตา (ตัวเรียกเลือกด้วย `variant`):
//   'row'     → แถวท้ายตารางเดสก์ท็อป (กรอกในแถวเดียวแล้ว Enter)
//   'stacked' → ฟอร์มเรียงแนวตั้งท้ายการ์ดรายวันบนมือถือ
// ช่องที่ใช้เป็นตัวเดียวกับในแถวปกติ (DutiesCell/EventCell/ToggleCell) โดยให้
// onSave เก็บลง state แทนการยิง server — ยิงจริงครั้งเดียวตอนกดปุ่ม
// ============================================================================

import { useState, useTransition, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addSlipCheckin, type SlipDetail, type SlipEventOption } from '../../actions'
import type { SalaryDutyRow } from '../../settings/actions'
import { DutiesCell, EventCell, ToggleCell } from './inline-cells'
import PanelRow from './panel-row'

/** หน้าตาของฟอร์ม — แถวในตาราง หรือ บล็อกเรียงแนวตั้ง */
export type FormVariant = 'row' | 'stacked'

interface Props {
  slipId: string
  periodStart: string
  periodEnd: string
  duties: SalaryDutyRow[]
  events: SlipEventOption[]
  onSlipChange: (slip: SlipDetail) => void
  variant: FormVariant
  /** จำนวนคอลัมน์ของตาราง — ใช้กับ colSpan เมื่อ variant = 'row' */
  columns?: number
}

const FIELD_INPUT =
  'border-input h-8 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30'

/** ช่องในแถวตารางเตี้ยกว่าเล็กน้อย เพื่อไม่ให้แถวสูงกว่าแถวข้อมูล */
const ROW_INPUT = FIELD_INPUT.replace('h-8', 'h-7')

export default function AddCheckinForm({
  slipId, periodStart, periodEnd, duties, events, onSlipChange, variant, columns = 10,
}: Props) {
  const router = useRouter()
  const [date, setDate] = useState('')
  const [inTime, setInTime] = useState('')
  const [outTime, setOutTime] = useState('')
  const [selectedDuties, setSelectedDuties] = useState<string[]>([])
  const [eventId, setEventId] = useState<string | null>(null)
  const [outOfProvince, setOutOfProvince] = useState(false)
  const [isPending, startTransition] = useTransition()

  const isRow = variant === 'row'
  const inputClass = isRow ? ROW_INPUT : FIELD_INPUT

  function reset() {
    setDate('')
    setInTime('')
    setOutTime('')
    setSelectedDuties([])
    setEventId(null)
    setOutOfProvince(false)
  }

  function submit() {
    if (!date) { toast.error('กรุณาเลือกวันที่'); return }
    if (!inTime) { toast.error('กรุณาระบุเวลาเข้า'); return }
    if (selectedDuties.length === 0) {
      toast.error('กรุณาเลือกหน้าที่หน้างานอย่างน้อย 1 อย่าง')
      return
    }
    if (periodStart && periodEnd && (date < periodStart || date > periodEnd)) {
      toast.error('วันที่อยู่นอกช่วงงวดนี้ — จะไม่ถูกนำมาคิดในสลิปใบนี้')
      return
    }

    startTransition(async () => {
      const res = await addSlipCheckin(slipId, {
        date,
        checkin_time: inTime,
        checkout_time: outTime || null,
        duties: selectedDuties,
        event_id: eventId,
        out_of_province: outOfProvince,
      })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      onSlipChange(res.slip)
      reset()
      toast.success('เพิ่มเช็คอินแล้ว')
      router.refresh()
    })
  }

  function onEnter(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); submit() }
  }

  // ── ช่องกรอก (ใช้ร่วมกันทั้งสองหน้าตา) ──────────────────────────────────
  const dateField = (
    <input
      type="date"
      value={date}
      min={periodStart || undefined}
      max={periodEnd || undefined}
      aria-label="วันที่ของเช็คอินที่ลืม"
      onChange={e => setDate(e.target.value)}
      onKeyDown={onEnter}
      className={inputClass}
    />
  )

  const timeField = (
    <div className="flex items-center gap-1">
      <input
        type="time"
        value={inTime}
        aria-label="เวลาเข้าของเช็คอินที่ลืม"
        onChange={e => setInTime(e.target.value)}
        onKeyDown={onEnter}
        className={`${inputClass} w-26 tabular-nums`}
      />
      <span className="text-muted-foreground">–</span>
      <input
        type="time"
        value={outTime}
        aria-label="เวลาออกของเช็คอินที่ลืม"
        onChange={e => setOutTime(e.target.value)}
        onKeyDown={onEnter}
        className={`${inputClass} w-26 tabular-nums`}
      />
    </div>
  )

  const dutiesField = (
    <DutiesCell
      value={selectedDuties}
      duties={duties}
      ariaLabel="หน้าที่ของเช็คอินที่ลืม"
      onSave={async next => { setSelectedDuties(next); return {} }}
    />
  )

  const eventField = (
    <EventCell
      value={eventId}
      events={events}
      onSave={async next => { setEventId(next); return {} }}
    />
  )

  const oopField = (
    <ToggleCell
      value={outOfProvince}
      ariaLabel="ต่างจังหวัดของเช็คอินที่ลืม"
      onSave={async next => { setOutOfProvince(next); return {} }}
    />
  )

  if (isRow) {
    return (
      <tr className="border-b bg-muted/20">
        <td className="px-3 py-2.5">{dateField}</td>
        <td className="px-3 py-2.5">{timeField}</td>
        <td className="px-3 py-2.5">{dutiesField}</td>
        <td className="px-3 py-2.5">{eventField}</td>
        <td className="px-3 py-2.5">{oopField}</td>
        <td colSpan={columns - 5} className="px-3 py-2.5 text-right">
          <Button type="button" size="sm" className="h-7" disabled={isPending} onClick={submit}>
            <Plus className="size-4" />
            เพิ่มเช็คอินที่ลืม
          </Button>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <p className="text-sm font-medium">เพิ่มเช็คอินที่ลืม</p>
      <PanelRow label="วันที่">{dateField}</PanelRow>
      <PanelRow label="เวลาเข้า–ออก">{timeField}</PanelRow>
      <PanelRow label="หน้าที่">{dutiesField}</PanelRow>
      <PanelRow label="อีเวนต์">{eventField}</PanelRow>
      <PanelRow label="ตจว.">{oopField}</PanelRow>
      <Button type="button" className="w-full" disabled={isPending} onClick={submit}>
        <Plus className="size-4" />
        เพิ่มเช็คอินที่ลืม
      </Button>
    </div>
  )
}
