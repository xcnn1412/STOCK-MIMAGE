'use client'

// เลือกกระเป๋าให้อีเวนต์ (ฟอร์มสร้าง/แก้ไข) — แสดงทุกใบ เตือนเมื่อกระเป๋าถูกจองวันเดียวกัน
// ชน/เช็คเวลาไม่ได้ = แดง, ต่อคิว = เหลือง · เตือนอย่างเดียว เลือกได้ทุกใบ (ADR-0003)

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { kitBookingClashes, type KitBookingDetail } from '@/app/(authenticated)/jobs/tracking/tracking-logic'

export default function KitPicker({
  kits,
  bookings,
  eventId,
  eventDate,
  eventTime,
  eventEndTime,
  initialIds = [],
}: {
  kits: { id: string; name: string }[]
  /** การจองของอีเวนต์ที่ยังไม่ปิด (รวมของอีเวนต์นี้เอง — ถูกข้ามตอนเทียบ) */
  bookings: KitBookingDetail[]
  /** อีเวนต์ที่กำลังแก้ ('' = สร้างใหม่) */
  eventId: string
  eventDate: string | null
  eventTime: string | null
  eventEndTime: string | null
  initialIds?: string[]
}) {
  const [checked, setChecked] = useState(() => new Set(initialIds))
  const initial = new Set(initialIds)
  const nameOf = (id: string) => bookings.find(b => b.eventId === id)?.eventName || 'อีเวนต์อื่น'

  if (kits.length === 0) return <p className="text-sm text-zinc-500 italic">ยังไม่มีกระเป๋าในระบบ</p>

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border rounded-lg p-4 max-h-[300px] overflow-y-auto">
      {kits.map(kit => {
        const clashes = kitBookingClashes(bookings, {
          kitId: kit.id,
          eventId,
          eventDate,
          eventTime: eventTime || null,
          eventEndTime: eventEndTime || null,
        })
        const warn = clashes.filter(c => c.status !== 'queued')
        const queued = clashes.filter(c => c.status === 'queued')
        const isChecked = checked.has(kit.id)
        return (
          <div key={kit.id} className="flex items-start space-x-2">
            <Checkbox
              id={`kit-${kit.id}`}
              name="kits"
              value={kit.id}
              checked={isChecked}
              onCheckedChange={c => {
                const next = new Set(checked)
                if (c) next.add(kit.id)
                else next.delete(kit.id)
                setChecked(next)
              }}
              className="mt-0.5"
            />
            <Label htmlFor={`kit-${kit.id}`} className="font-normal cursor-pointer flex flex-col items-start gap-0.5">
              <span>
                {kit.name}
                {isChecked && !initial.has(kit.id) && !!eventId && <span className="text-xs text-green-600 font-bold ml-1">(ใหม่)</span>}
                {!isChecked && initial.has(kit.id) && <span className="text-xs text-red-500 font-bold ml-1">(เอาออก)</span>}
              </span>
              {warn.length > 0 && (
                <span className="text-xs text-rose-600 dark:text-rose-400">
                  {warn.some(c => c.status === 'conflict') ? '⚠️ เวลาชนกับ' : '⚠️ วันเดียวกัน (เช็คเวลาไม่ได้)'}: {warn.map(c => nameOf(c.eventId)).join(', ')}
                </span>
              )}
              {queued.length > 0 && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  ต่อคิวกับ: {queued.map(c => nameOf(c.eventId)).join(', ')} — ต้องคืนกระเป๋าก่อน
                </span>
              )}
            </Label>
          </div>
        )
      })}
    </div>
  )
}
