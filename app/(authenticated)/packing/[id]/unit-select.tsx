'use client'

// ช่องเลือกหน่วยอุปกรณ์ของหน้าใบจัดของ — ใช้ทั้งขั้นเลือกของ (ต่อช่องของข้อกำหนด) และกล่อง "เปลี่ยนของ" ในขั้นกำลังหยิบ
// แต่ละตัวเลือกมีป้ายความว่าง (ว่าง/ต่อคิว/ชน/ไม่พร้อม/ออกงานอยู่) จาก lineAvailability · ไม่พร้อม = เลือกไม่ได้
// ชน = เลือกได้แต่ผู้เรียกถามยืนยันก่อน (confirmClash) — นโยบายเตือนไม่บล็อกเดิม
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { CategoryUnit } from '../../packages/types'
import { LINE_AVAILABILITY_LABELS, lineAvailability } from '../packing-logic'
import type { LineAvailability, LineBooking } from '../types'

export const NONE = '__none'

export type EventSlot = { eventId: string; eventDate: string | null; eventTime?: string | null; eventEndTime?: string | null }

const ORDER: Record<LineAvailability['status'], number> = { free: 0, queued: 1, clash: 2, out: 3, unavailable: 4 }
export const AVAILABILITY_TEXT: Record<LineAvailability['status'], string> = {
  free: 'text-emerald-700 dark:text-emerald-400',
  queued: 'text-amber-700 dark:text-amber-400',
  clash: 'text-red-700 dark:text-red-400',
  out: 'text-orange-700 dark:text-orange-400',
  unavailable: 'text-zinc-400',
}

/** ป้ายความว่างพร้อมชื่องานที่ชน/ต่อคิว เช่น "ชน: งาน ข" */
export function availabilityText(a: LineAvailability): string {
  const label = a.status === 'clash' && a.clashKind === 'unknown' ? 'เช็คเวลาไม่ได้' : LINE_AVAILABILITY_LABELS[a.status]
  return a.eventNames.length ? `${label}: ${a.eventNames.join(', ')}` : label
}

export function unitLabel(u: Pick<CategoryUnit, 'name' | 'serial' | 'kind'>): string {
  return `${u.kind === 'kit' ? 'กระเป๋า ' : ''}${u.name}${u.serial ? ` (${u.serial})` : ''}`
}

/** ข้อความถามยืนยันเมื่อเลือกหน่วยที่ชน — null = ไม่ต้องถาม */
export function clashQuestion(u: Pick<CategoryUnit, 'name'>, a: LineAvailability): { title: string; description: string } | null {
  if (a.status !== 'clash') return null
  return {
    title: `"${u.name}" ${a.clashKind === 'unknown' ? 'อาจชนกับงานอื่น' : 'ชนกับงานอื่น'}`,
    description: `${a.clashKind === 'unknown' ? 'มีงานวันเดียวกันที่เช็คเวลาไม่ได้' : 'เวลาทับกับ'}: ${a.eventNames.join(', ') || 'อีเวนต์อื่น'} — ยังเลือกหน่วยนี้ต่อไหม`,
  }
}

export function UnitSelect({
  units,
  value,
  onChange,
  event,
  bookings,
  taken,
  placeholder,
  requirePickable = false,
  allowNone = true,
  className,
}: {
  units: CategoryUnit[]
  value: string
  onChange: (unit: CategoryUnit | null, availability: LineAvailability | null) => void
  event: EventSlot
  bookings: LineBooking[]
  /** หน่วยที่อยู่ในใบแล้ว (ช่องอื่น) — เลือกซ้ำไม่ได้ */
  taken: ReadonlySet<string>
  placeholder: string
  /** กล่องเปลี่ยนของ: ต้องหยิบได้ตอนนี้ (ออกงานอยู่ = เลือกไม่ได้) */
  requirePickable?: boolean
  allowNone?: boolean
  className?: string
}) {
  const rows = units
    .map(u => ({ unit: u, a: lineAvailability(u, event, bookings) }))
    .sort((x, y) => ORDER[x.a.status] - ORDER[y.a.status] || x.unit.name.localeCompare(y.unit.name, 'th', { numeric: true }))

  return (
    <Select
      value={value || NONE}
      onValueChange={v => {
        if (v === NONE) return onChange(null, null)
        const row = rows.find(r => r.unit.id === v)
        if (row) onChange(row.unit, row.a)
      }}
    >
      <SelectTrigger className={cn('h-11 w-full min-w-0 text-sm', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {allowNone && <SelectItem value={NONE}>ยังไม่เลือก</SelectItem>}
        {rows.length === 0 && <div className="px-2 py-3 text-sm text-zinc-500">ไม่มีอุปกรณ์ในตัวเลือก</div>}
        {rows.map(({ unit, a }) => {
          const blocked = !a.selectable || (requirePickable && !a.pickable) || (taken.has(unit.id) && unit.id !== value)
          return (
            <SelectItem key={unit.id} value={unit.id} disabled={blocked}>
              <span className="truncate">{unitLabel(unit)}</span>
              <span className={cn('ml-1 text-xs', AVAILABILITY_TEXT[a.status])}>
                · {taken.has(unit.id) && unit.id !== value ? 'อยู่ในใบนี้แล้ว' : availabilityText(a)}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
