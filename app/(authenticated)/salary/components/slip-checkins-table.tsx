'use client'

// ============================================================================
// ข้อมูลต้นทางในงวด — เช็คอินของเจ้าของสลิปที่อยู่ในช่วงงวดเดียวกับที่เครื่องคำนวณใช้
//
// admin แก้เวลาเข้า-ออก / หน้าที่ / จังหวัด / ต่างจังหวัด และเพิ่มเช็คอินที่ลืมได้จากที่นี่
// โดยเรียก server action ของ "โมดูลเช็คอิน" ตรงๆ (adminEditCheckin / adminCheckIn)
// แล้วต่อด้วย recomputeSlip เสมอ — แก้ต้นทางอย่างเดียวไม่ทำให้บรรทัดในสลิปเปลี่ยน
// (ค่าที่แก้มือไว้ไม่ถูกทับ — compute.ts §6)
// ============================================================================

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarPlus, MapPin, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { THAI_PROVINCES } from '@/lib/thai-address'
import { formatThaiDate } from '@/lib/thai-date'
import { adminCheckIn, adminEditCheckin } from '@/app/(authenticated)/check-in/actions'
import { recomputeSlip } from '../actions'
import type { SlipCheckinRow } from '../actions'
import type { SalaryDutyRow } from '../settings/actions'

interface Props {
  slipId: string
  /** เจ้าของสลิป — ใช้เป็น target ตอนเพิ่มเช็คอินที่ลืม */
  userId: string
  periodStart: string
  periodEnd: string
  checkins: SlipCheckinRow[]
  duties: SalaryDutyRow[]
  /** admin + สลิปร่างเท่านั้น — ปิดงวดแล้วตารางนี้อ่านอย่างเดียว */
  editable: boolean
}

const CHECK_TYPE_LABEL: Record<SlipCheckinRow['check_type'], string> = {
  office: 'ออฟฟิศ',
  onsite: 'ไปหน้างาน',
  remote: 'นอกสถานที่',
}

const BANGKOK_OFFSET = 7 * 60 * 60 * 1000

/** instant → วัน/เวลาไทย สำหรับใส่ใน <input type="date"> / <input type="time"> */
function bkkParts(iso: string): { date: string; time: string } {
  const s = new Date(new Date(iso).getTime() + BANGKOK_OFFSET).toISOString()
  return { date: s.slice(0, 10), time: s.slice(11, 16) }
}

export default function SlipCheckinsTable({
  slipId, userId, periodStart, periodEnd, checkins, duties, editable,
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<SlipCheckinRow | null>(null)
  const [adding, setAdding] = useState(false)

  const dutyName = new Map(duties.map(d => [d.code, d.name_th]))
  const activeDuties = duties.filter(d => d.is_active)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">เช็คอินในงวด (ข้อมูลต้นทาง)</h2>
          <p className="text-xs text-muted-foreground">
            แก้แล้วระบบคำนวณสลิปใหม่ให้ทันที — ค่าที่แก้มือไว้ไม่ถูกทับ
          </p>
        </div>
        {editable && (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            <CalendarPlus className="size-4" />
            เพิ่มเช็คอินที่ลืม
          </Button>
        )}
      </div>

      {checkins.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          ไม่มีเช็คอินในช่วงงวดนี้
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-160 text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">วันที่ · เวลา</th>
                <th className="px-3 py-2 text-left font-medium">ประเภท</th>
                <th className="px-3 py-2 text-left font-medium">อีเวนต์</th>
                <th className="px-3 py-2 text-left font-medium">หน้าที่</th>
                <th className="px-3 py-2 text-left font-medium">พื้นที่</th>
                {editable && <th className="px-3 py-2 text-right font-medium">จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {checkins.map(c => {
                const inAt = bkkParts(c.checked_in_at)
                const outAt = c.checked_out_at ? bkkParts(c.checked_out_at) : null
                return (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div>{formatThaiDate(inAt.date)}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {inAt.time} –{' '}
                        {outAt
                          ? `${outAt.date !== inAt.date ? `${formatThaiDate(outAt.date)} ` : ''}${outAt.time}`
                          : 'ยังไม่ออก'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {CHECK_TYPE_LABEL[c.check_type]}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {c.event_name || (c.event_id ? 'อีเวนต์ (อ้างอิง)' : '–')}
                    </td>
                    <td className="px-3 py-2.5">
                      {c.duties.length === 0 ? (
                        <span className="text-xs text-muted-foreground">–</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {c.duties.map(code => (
                            <Badge key={code} variant="outline" className="text-[11px] font-normal">
                              {dutyName.get(code) || code}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        {c.province || c.district ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" />
                            {[c.district, c.province].filter(Boolean).join(' · ')}
                          </span>
                        ) : (
                          <span>–</span>
                        )}
                        {c.out_of_province && (
                          <Badge
                            variant="outline"
                            className="border-orange-200 bg-orange-50 text-[11px] text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-400"
                          >
                            ตจว.
                          </Badge>
                        )}
                      </div>
                    </td>
                    {editable && (
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditing(c)}
                        >
                          <Pencil className="size-3.5" />
                          แก้ไข
                        </Button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editable && editing && (
        <EditCheckinDialog
          key={editing.id}
          slipId={slipId}
          checkin={editing}
          duties={activeDuties}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); router.refresh() }}
        />
      )}

      {editable && adding && (
        <AddCheckinDialog
          slipId={slipId}
          userId={userId}
          periodStart={periodStart}
          periodEnd={periodEnd}
          duties={activeDuties}
          onClose={() => setAdding(false)}
          onDone={() => { setAdding(false); router.refresh() }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ชิ้นส่วนที่ใช้ร่วมกันสองไดอะล็อก
// ────────────────────────────────────────────────────────────────────────────

function DutyPicker({
  duties, selected, onToggle, idPrefix,
}: {
  duties: SalaryDutyRow[]
  selected: string[]
  onToggle: (code: string, on: boolean) => void
  idPrefix: string
}) {
  if (duties.length === 0) {
    return (
      <p className="text-xs text-amber-600 dark:text-amber-500">
        ยังไม่มีหน้าที่หน้างานที่เปิดใช้อยู่ — เพิ่มได้ที่ตั้งค่าเงินเดือน
      </p>
    )
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {duties.map(d => (
        <div key={d.code} className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-${d.code}`}
            checked={selected.includes(d.code)}
            onCheckedChange={v => onToggle(d.code, v === true)}
          />
          <Label htmlFor={`${idPrefix}-${d.code}`} className="text-sm font-normal">
            {d.name_th}
          </Label>
        </div>
      ))}
    </div>
  )
}

function ProvinceFields({
  province, district, outOfProvince, onProvince, onDistrict, onOutOfProvince, idPrefix,
}: {
  province: string
  district: string
  outOfProvince: boolean
  onProvince: (v: string) => void
  onDistrict: (v: string) => void
  onOutOfProvince: (v: boolean) => void
  idPrefix: string
}) {
  const known = (THAI_PROVINCES as readonly string[]).includes(province)
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-province`} className="text-xs">จังหวัด</Label>
          <select
            id={`${idPrefix}-province`}
            value={province}
            onChange={e => onProvince(e.target.value)}
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
          >
            <option value="">— ไม่ระบุ —</option>
            {/* ค่าที่ reverse geocode เขียนมาแบบไม่ตรงรายการ — คงไว้ไม่ให้หายตอนบันทึก */}
            {province && !known && <option value={province}>{province}</option>}
            {THAI_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-district`} className="text-xs">เขต / อำเภอ</Label>
          <Input
            id={`${idPrefix}-district`}
            value={district}
            onChange={e => onDistrict(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-oop`}
          checked={outOfProvince}
          onCheckedChange={v => onOutOfProvince(v === true)}
        />
        <Label htmlFor={`${idPrefix}-oop`} className="text-sm font-normal">
          ต่างจังหวัด (คิดเบิ้ลต่างจังหวัดของเช็คอินนี้)
        </Label>
      </div>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// แก้เช็คอินเดิม
// ────────────────────────────────────────────────────────────────────────────

function EditCheckinDialog({
  slipId, checkin, duties, onClose, onDone,
}: {
  slipId: string
  checkin: SlipCheckinRow
  duties: SalaryDutyRow[]
  onClose: () => void
  onDone: () => void
}) {
  const initialIn = bkkParts(checkin.checked_in_at)
  const initialOut = checkin.checked_out_at ? bkkParts(checkin.checked_out_at) : null

  const [inDate, setInDate] = useState(initialIn.date)
  const [inTime, setInTime] = useState(initialIn.time)
  const [outDate, setOutDate] = useState(initialOut?.date || initialIn.date)
  const [outTime, setOutTime] = useState(initialOut?.time || '')
  const [selectedDuties, setSelectedDuties] = useState<string[]>(checkin.duties)
  const [province, setProvince] = useState(checkin.province || '')
  const [district, setDistrict] = useState(checkin.district || '')
  const [outOfProvince, setOutOfProvince] = useState(checkin.out_of_province)
  const [isPending, startTransition] = useTransition()

  const isOnsite = checkin.check_type === 'onsite'

  function toggleDuty(code: string, on: boolean) {
    setSelectedDuties(prev => (on ? [...prev, code] : prev.filter(c => c !== code)))
  }

  function save() {
    if (!inDate || !inTime) {
      toast.error('กรุณาระบุทั้งวันที่และเวลาเข้า')
      return
    }
    if (isOnsite && selectedDuties.length === 0) {
      toast.error('เช็คอินหน้างานต้องมีหน้าที่อย่างน้อย 1 อย่าง')
      return
    }

    const fd = new FormData()
    fd.set('checkin_id', checkin.id)
    fd.set('checkin_date', inDate)
    fd.set('checkin_time', inTime)
    if (outTime) {
      fd.set('checkout_date', outDate || inDate)
      fd.set('checkout_time', outTime)
    } else if (checkin.checked_out_at) {
      // ลบเวลาออกในฟอร์ม = ตั้งกลับเป็น "ยังไม่ check-out"
      fd.set('clear_checkout', 'true')
    }
    // ฟิลด์ค่าสตาฟใช้เฉพาะเช็คอินหน้างาน — ประเภทอื่นไม่ส่งไปให้เขียนทับของเดิม
    if (isOnsite) {
      selectedDuties.forEach(code => fd.append('duties', code))
      fd.set('province', province)
      fd.set('district', district)
      fd.set('out_of_province', outOfProvince ? 'true' : 'false')
    }

    startTransition(async () => {
      const res = await adminEditCheckin(fd)
      if (res.error) {
        toast.error(res.error)
        return
      }
      const recomputed = await recomputeSlip(slipId)
      if (recomputed.error) {
        toast.error(`แก้เช็คอินแล้ว แต่คำนวณใหม่ไม่สำเร็จ: ${recomputed.error}`)
        onDone()
        return
      }
      toast.success('แก้เช็คอินและคำนวณสลิปใหม่แล้ว')
      onDone()
    })
  }

  return (
    <Dialog open onOpenChange={v => { if (!v && !isPending) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>แก้เช็คอิน</DialogTitle>
          <DialogDescription>
            {formatThaiDate(initialIn.date)} · {CHECK_TYPE_LABEL[checkin.check_type]}
            {checkin.event_name ? ` · ${checkin.event_name}` : ''} — บันทึกแล้วระบบจะคำนวณสลิปใหม่ให้
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">เวลาเข้า</Label>
              <div className="flex gap-2">
                <Input type="date" value={inDate} onChange={e => setInDate(e.target.value)} className="flex-1" />
                <Input type="time" value={inTime} onChange={e => setInTime(e.target.value)} className="w-28" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">เวลาออก</Label>
              <div className="flex gap-2">
                <Input type="date" value={outDate} onChange={e => setOutDate(e.target.value)} className="flex-1" />
                <Input type="time" value={outTime} onChange={e => setOutTime(e.target.value)} className="w-28" />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            ลบเวลาออกทิ้ง = กลับเป็น &ldquo;ยังไม่ออก&rdquo; (ไม่คิด OT) · กะข้ามคืนให้ตั้งวันที่ออกเป็นวันถัดไป
          </p>

          {isOnsite && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">หน้าที่หน้างาน</Label>
                <DutyPicker
                  duties={duties}
                  selected={selectedDuties}
                  onToggle={toggleDuty}
                  idPrefix={`edit-duty-${checkin.id}`}
                />
              </div>
              <ProvinceFields
                province={province}
                district={district}
                outOfProvince={outOfProvince}
                onProvince={setProvince}
                onDistrict={setDistrict}
                onOutOfProvince={setOutOfProvince}
                idPrefix={`edit-${checkin.id}`}
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="button" disabled={isPending} onClick={save}>
            บันทึกและคำนวณใหม่
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// เพิ่มเช็คอินที่ลืม
// ────────────────────────────────────────────────────────────────────────────

function AddCheckinDialog({
  slipId, userId, periodStart, periodEnd, duties, onClose, onDone,
}: {
  slipId: string
  userId: string
  periodStart: string
  periodEnd: string
  duties: SalaryDutyRow[]
  onClose: () => void
  onDone: () => void
}) {
  const [date, setDate] = useState('')
  const [inTime, setInTime] = useState('')
  const [outTime, setOutTime] = useState('')
  const [selectedDuties, setSelectedDuties] = useState<string[]>([])
  const [province, setProvince] = useState('')
  const [district, setDistrict] = useState('')
  const [outOfProvince, setOutOfProvince] = useState(false)
  const [isPending, startTransition] = useTransition()

  function toggleDuty(code: string, on: boolean) {
    setSelectedDuties(prev => (on ? [...prev, code] : prev.filter(c => c !== code)))
  }

  function save() {
    if (!date) { toast.error('กรุณาเลือกวันที่'); return }
    if (!inTime) { toast.error('กรุณาระบุเวลาเข้า'); return }
    if (selectedDuties.length === 0) {
      toast.error('กรุณาเลือกหน้าที่หน้างานอย่างน้อย 1 อย่าง')
      return
    }
    // นอกช่วงงวดจะไม่เข้าสลิปใบนี้ — เตือนก่อนเสียเวลาคำนวณใหม่แล้วไม่เห็นอะไรเปลี่ยน
    if (periodStart && periodEnd && (date < periodStart || date > periodEnd)) {
      toast.error('วันที่อยู่นอกช่วงงวดนี้ — จะไม่ถูกนำมาคิดในสลิปใบนี้')
      return
    }

    const fd = new FormData()
    fd.set('target_user_id', userId)
    fd.set('check_type', 'onsite')
    fd.set('checkin_date', date)
    fd.set('checkin_time', inTime)
    if (outTime) fd.set('checkout_time', outTime)
    selectedDuties.forEach(code => fd.append('duties', code))
    if (province) fd.set('province', province)
    if (district) fd.set('district', district)
    fd.set('out_of_province', outOfProvince ? 'true' : 'false')
    fd.set('note', 'เพิ่มย้อนหลังจากสลิปเงินเดือน')

    startTransition(async () => {
      const res = await adminCheckIn(fd)
      if (res.error) {
        toast.error(res.error)
        return
      }
      const recomputed = await recomputeSlip(slipId)
      if (recomputed.error) {
        toast.error(`เพิ่มเช็คอินแล้ว แต่คำนวณใหม่ไม่สำเร็จ: ${recomputed.error}`)
        onDone()
        return
      }
      toast.success('เพิ่มเช็คอินและคำนวณสลิปใหม่แล้ว')
      onDone()
    })
  }

  return (
    <Dialog open onOpenChange={v => { if (!v && !isPending) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>เพิ่มเช็คอินที่ลืม</DialogTitle>
          <DialogDescription>
            สร้างเช็คอิน &ldquo;ไปหน้างาน&rdquo; ย้อนหลังให้เจ้าของสลิป — ต้องอยู่ในช่วง{' '}
            {formatThaiDate(periodStart)} – {formatThaiDate(periodEnd)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-checkin-date" className="text-xs">วันที่</Label>
              <Input
                id="add-checkin-date"
                type="date"
                value={date}
                min={periodStart || undefined}
                max={periodEnd || undefined}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-checkin-time" className="text-xs">เวลาเข้า</Label>
              <Input
                id="add-checkin-time"
                type="time"
                value={inTime}
                onChange={e => setInTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-checkout-time" className="text-xs">เวลาออก</Label>
              <Input
                id="add-checkout-time"
                type="time"
                value={outTime}
                onChange={e => setOutTime(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            เวลาออกใช้วันเดียวกับเวลาเข้า · ไม่ผูกอีเวนต์ให้ (ผูกภายหลังได้ที่รายงานเช็คอิน)
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs">หน้าที่หน้างาน (อย่างน้อย 1)</Label>
            <DutyPicker
              duties={duties}
              selected={selectedDuties}
              onToggle={toggleDuty}
              idPrefix="add-duty"
            />
          </div>

          <ProvinceFields
            province={province}
            district={district}
            outOfProvince={outOfProvince}
            onProvince={setProvince}
            onDistrict={setDistrict}
            onOutOfProvince={setOutOfProvince}
            idPrefix="add"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="button" disabled={isPending} onClick={save}>
            เพิ่มและคำนวณใหม่
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
