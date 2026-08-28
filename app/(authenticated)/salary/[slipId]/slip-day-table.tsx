'use client'

// ============================================================================
// ตารางรายวันของสลิป (เดสก์ท็อป) — spec: docs/specs/salary-slip-daily-ui.md
//
// 1 วัน = 1 แถว (วันที่มีเช็คอินหลายครั้ง = หลายแถวย่อยใต้วันเดียวกัน)
// รวมข้อมูลต้นทางของวันนั้น (เวลาเข้า–ออก หน้าที่ อีเวนต์ ตจว.) กับเงินของวันนั้น
// (ค่าสตาฟ เบิ้ล OT รันเนอร์) ไว้ในแถวเดียว แก้ได้ตรงในช่อง
//
// ทุกการแก้ยิง server action ตัวเดียวที่ทำ "แก้ → คำนวณใหม่ → คืนสลิปใหม่" ให้เสร็จ
// แล้วส่งสลิปใหม่กลับผ่าน onSlipChange — ไม่มีปุ่ม "คำนวณใหม่" ให้กดเองอีก
// การแก้ "เช็คอิน" ต้อง router.refresh() ด้วย เพราะ action คืนมาแค่สลิป
// ส่วนแถวเช็คอิน/อีเวนต์มาจาก server component ของหน้าเพจ
// ============================================================================

import { useState, useTransition, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatThaiDate } from '@/lib/thai-date'
import { fmtMoney } from '../format'
import {
  addSlipAdjustment, addSlipCheckin, clearSlipLineOverride, editSlipCheckin,
  overrideSlipLine, removeSlipAdjustment, setRunnerAmounts,
  type SlipCheckinPatch, type SlipCheckinRow, type SlipDetail, type SlipEventOption,
} from '../actions'
import { groupSlipByDay, shiftDay, type SalaryLine } from '../compute'
import type { SalaryDutyRow } from '../settings/actions'
import {
  DutiesCell, EventCell, MoneyCell, RunnerCell, TimeCell, ToggleCell, type SaveResult,
} from './components/inline-cells'

interface Props {
  slip: SlipDetail
  /** เช็คอินต้นทางในงวด — ว่างเมื่อไม่ใช่ admin (ตารางจะเหลือแต่บรรทัดเงินรายวัน) */
  checkins: SlipCheckinRow[]
  duties: SalaryDutyRow[]
  events: SlipEventOption[]
  /** admin + สลิปร่างเท่านั้น — ที่เหลืออ่านอย่างเดียว (server ตรวจซ้ำทุก action) */
  editable: boolean
  /** สลิปที่ action คืนกลับมาหลังบันทึก — ตัวเรียกเก็บไว้ใน state */
  onSlipChange: (slip: SlipDetail) => void
}

const CHECK_TYPE_LABEL: Record<SlipCheckinRow['check_type'], string> = {
  office: 'ออฟฟิศ',
  onsite: 'หน้างาน',
  remote: 'นอกสถานที่',
}

const BANGKOK_OFFSET = 7 * 60 * 60 * 1000

/** จำนวนคอลัมน์ของตาราง — ใช้กับ colSpan ของแถวท้ายตาราง */
const COLUMNS = 10

/** instant → (วันไทย, เวลาไทย) สำหรับใส่ใน <input type="time"> */
function bkkParts(iso: string): { date: string; time: string } {
  const s = new Date(new Date(iso).getTime() + BANGKOK_OFFSET).toISOString()
  return { date: s.slice(0, 10), time: s.slice(11, 16) }
}

/** (วันไทย, เวลาไทย) → instant */
function toISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00+07:00`).toISOString()
}

/**
 * วันของเวลาออกเมื่อแก้เฉพาะ "เวลา" ในแถว — เวลาออกที่ไม่มากกว่าเวลาเข้าถือเป็นกะข้ามคืน
 * (ตารางรายวันมีช่องเวลาอย่างเดียว ไม่มีช่องวันที่ออกแยกเหมือนไดอะล็อกเดิม)
 */
function checkoutDateFor(inDate: string, inTime: string, outTime: string): string {
  return outTime <= inTime ? shiftDay(inDate, 1) : inDate
}

function isMissing(l: SalaryLine): boolean {
  return l.amount === null || l.amount === undefined
}

export default function SlipDayTable({
  slip, checkins, duties, events, editable, onSlipChange,
}: Props) {
  const router = useRouter()
  const days = groupSlipByDay(slip.lines, checkins, slip.warnings)
  const dutyName = new Map(duties.map(d => [d.code, d.name_th]))

  // รันเนอร์ทั้งใบ — ใช้ตัดสินว่าช่องไหนได้ปุ่ม "ใช้ยอดนี้กับวันที่ยังว่าง"
  const runnerLines = days.flatMap(d => d.runnerLines)
  const emptyRunners = runnerLines.filter(isMissing)
  const firstFilledRunner = runnerLines.find(l => !isMissing(l))
  const applyRunnerKey =
    editable && firstFilledRunner && emptyRunners.length > 0 ? firstFilledRunner.key : null

  // ── ตัวห่อ action: ทุกตัวคืน SaveResult ให้ช่องในแถวใช้ตรงๆ ──────────────

  async function saveCheckin(checkinId: string, patch: SlipCheckinPatch): Promise<SaveResult> {
    const res = await editSlipCheckin(slip.id, checkinId, patch)
    if ('error' in res) return { error: res.error }
    onSlipChange(res.slip)
    // action คืนมาแค่สลิป — แถวเช็คอิน/อีเวนต์ต้องให้ server component โหลดใหม่
    router.refresh()
    return {}
  }

  async function saveOverride(key: string, amount: number, note: string): Promise<SaveResult> {
    const res = await overrideSlipLine(slip.id, key, amount, note)
    if (res.error) return { error: res.error }
    if (res.slip) onSlipChange(res.slip)
    return {}
  }

  async function clearOverride(key: string): Promise<SaveResult> {
    const res = await clearSlipLineOverride(slip.id, key)
    if (res.error) return { error: res.error }
    if (res.slip) onSlipChange(res.slip)
    return {}
  }

  async function saveRunner(key: string, amount: number | null): Promise<SaveResult> {
    if (amount === null) return clearOverride(key)
    const res = await setRunnerAmounts(slip.id, [{ key, amount }])
    if ('error' in res) return { error: res.error }
    onSlipChange(res.slip)
    return {}
  }

  async function applyRunnerToEmpty(amount: number): Promise<SaveResult> {
    const entries = emptyRunners.map(l => ({ key: l.key, amount }))
    if (entries.length === 0) return {}
    const res = await setRunnerAmounts(slip.id, entries)
    if ('error' in res) return { error: res.error }
    onSlipChange(res.slip)
    return {}
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-280 text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">วันที่</th>
            <th className="px-3 py-2 text-left font-medium">เช็คอิน</th>
            <th className="px-3 py-2 text-left font-medium">หน้าที่</th>
            <th className="px-3 py-2 text-left font-medium">อีเวนต์</th>
            <th className="px-3 py-2 text-left font-medium">ตจว.</th>
            <th className="px-3 py-2 text-right font-medium">ค่าสตาฟ</th>
            <th className="px-3 py-2 text-right font-medium">เบิ้ล</th>
            <th className="px-3 py-2 text-right font-medium">OT</th>
            <th className="px-3 py-2 text-right font-medium">รันเนอร์</th>
            <th className="px-3 py-2 text-right font-medium">รวมวัน</th>
          </tr>
        </thead>

        <tbody>
          {days.length === 0 && (
            <tr className="border-b">
              <td colSpan={COLUMNS} className="px-3 py-8 text-center text-muted-foreground">
                ไม่มีรายการในงวดนี้
              </td>
            </tr>
          )}

          {days.flatMap(day => {
            const subs = day.checkins
            const span = Math.max(1, subs.length)
            const rows = subs.length > 0 ? subs : [null]

            return rows.map((sub, idx) => {
              const c = sub?.checkin
              const paidElsewhere = !!c?.paid_slip_id && c.paid_slip_id !== slip.id
              const rowEditable = editable && !!c && !paidElsewhere
              const onsite = c?.check_type === 'onsite'
              const inAt = c ? bkkParts(c.checked_in_at) : null
              const outAt = c?.checked_out_at ? bkkParts(c.checked_out_at) : null
              const oopLine = sub?.oopLine
              const otLine = day.otLine

              return (
                <tr
                  key={c ? c.id : day.date}
                  id={idx === 0 ? `day-${day.date}` : undefined}
                  className={cn('border-b align-top', paidElsewhere && 'text-muted-foreground')}
                >
                  {idx === 0 && (
                    <td rowSpan={span} className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{formatThaiDate(day.date)}</span>
                        {day.warnings.length > 0 && (
                          // checklist ที่คลิกไปแก้ได้อยู่ใน #29 — ตอนนี้บอกด้วย tooltip ก่อน
                          <span
                            title={day.warnings.map(w => w.message).join('\n')}
                            aria-label={`คำเตือน ${day.warnings.length} ข้อ`}
                          >
                            <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-500" />
                          </span>
                        )}
                      </div>
                    </td>
                  )}

                  {/* เช็คอิน — ประเภท + เวลาเข้า–ออก */}
                  <td className="px-3 py-2.5">
                    {!c || !inAt ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                            {CHECK_TYPE_LABEL[c.check_type]}
                          </span>
                          <TimeCell
                            value={inAt.time}
                            disabled={!rowEditable}
                            ariaLabel={`เวลาเข้า ${day.date}`}
                            onSave={t =>
                              t
                                ? saveCheckin(c.id, { checked_in_at: toISO(inAt.date, t) })
                                : Promise.resolve({ error: 'เวลาเข้าจะว่างไม่ได้' })
                            }
                          />
                          <span className="text-muted-foreground">–</span>
                          <TimeCell
                            value={outAt?.time ?? null}
                            allowClear
                            placeholder="ยังไม่ออก"
                            disabled={!rowEditable}
                            ariaLabel={`เวลาออก ${day.date}`}
                            onSave={t =>
                              saveCheckin(c.id, {
                                checked_out_at:
                                  t === null
                                    ? null
                                    : toISO(checkoutDateFor(inAt.date, inAt.time, t), t),
                              })
                            }
                          />
                        </div>
                        {paidElsewhere && (
                          <Link
                            href={`/salary/${c.paid_slip_id}`}
                            className="inline-flex rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:underline dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
                          >
                            จ่ายในสลิปอื่น
                          </Link>
                        )}
                      </div>
                    )}
                  </td>

                  {/* หน้าที่ — เฉพาะเช็คอินหน้างาน */}
                  <td className="px-3 py-2.5">
                    {c && onsite ? (
                      <DutiesCell
                        value={c.duties}
                        duties={duties}
                        disabled={!rowEditable}
                        ariaLabel={`หน้าที่ ${day.date}`}
                        onSave={next => saveCheckin(c.id, { duties: next })}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* อีเวนต์ — เฉพาะเช็คอินหน้างาน */}
                  <td className="px-3 py-2.5">
                    {c && onsite ? (
                      <EventCell
                        value={c.event_id}
                        eventName={c.event_name}
                        events={events}
                        disabled={!rowEditable}
                        onSave={next => saveCheckin(c.id, { event_id: next })}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* ตจว. */}
                  <td className="px-3 py-2.5">
                    {c && onsite ? (
                      <ToggleCell
                        value={c.out_of_province}
                        disabled={!rowEditable}
                        ariaLabel={`ต่างจังหวัด ${day.date}`}
                        onSave={next => saveCheckin(c.id, { out_of_province: next })}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* ค่าสตาฟ — 1 บรรทัดต่อหน้าที่ */}
                  <td className="px-3 py-2.5 text-right">
                    {!sub || sub.siteLines.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        {sub.siteLines.map(l => (
                          <span key={l.key} className="flex items-center justify-end gap-1">
                            {sub.siteLines.length > 1 && (
                              <span className="text-[11px] text-muted-foreground">
                                {dutyName.get(l.duty || '') || l.duty}
                              </span>
                            )}
                            <MoneyCell
                              amount={l.amount}
                              computed={l.computed_amount}
                              overrideNote={l.override_note}
                              disabled={!editable}
                              ariaLabel={`ค่าสตาฟ ${l.label}`}
                              onSave={(amount, note) => saveOverride(l.key, amount, note)}
                              onClear={() => clearOverride(l.key)}
                            />
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* เบิ้ลต่างจังหวัด */}
                  <td className="px-3 py-2.5 text-right">
                    {oopLine ? (
                      <MoneyCell
                        amount={oopLine.amount}
                        computed={oopLine.computed_amount}
                        overrideNote={oopLine.override_note}
                        disabled={!editable}
                        ariaLabel={`เบิ้ลต่างจังหวัด ${day.date}`}
                        onSave={(amount, note) => saveOverride(oopLine.key, amount, note)}
                        onClear={() => clearOverride(oopLine.key)}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* OT — ชั่วโมง + ยอด (คิดรวมทั้งวัน จึงเกาะแถวแรก) */}
                  {idx === 0 && (
                    <td rowSpan={span} className="px-3 py-2.5 text-right">
                      {otLine ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {otLine.hours ?? 0} ชม.
                          </span>
                          <MoneyCell
                            amount={otLine.amount}
                            computed={otLine.computed_amount}
                            overrideNote={otLine.override_note}
                            disabled={!editable}
                            ariaLabel={`OT ${day.date}`}
                            onSave={(amount, note) => saveOverride(otLine.key, amount, note)}
                            onClear={() => clearOverride(otLine.key)}
                          />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}

                  {/* รันเนอร์ — กรอกยอดเอง เกาะแถวแรกของวัน */}
                  {idx === 0 && (
                    <td rowSpan={span} className="px-3 py-2.5 text-right">
                      {day.runnerLines.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          {day.runnerLines.map(l => (
                            <RunnerCell
                              key={l.key}
                              value={l.amount ?? null}
                              disabled={!editable}
                              ariaLabel={`ยอดรันเนอร์ ${day.date}`}
                              onSave={amount => saveRunner(l.key, amount)}
                              onApplyToEmpty={
                                applyRunnerKey === l.key ? applyRunnerToEmpty : undefined
                              }
                            />
                          ))}
                        </div>
                      )}
                    </td>
                  )}

                  {idx === 0 && (
                    <td rowSpan={span} className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {fmtMoney(day.dayTotal)}
                    </td>
                  )}
                </tr>
              )
            })
          })}

          {editable && (
            <AddCheckinRow
              slipId={slip.id}
              periodStart={slip.period_start}
              periodEnd={slip.period_end}
              duties={duties}
              events={events}
              onSlipChange={onSlipChange}
            />
          )}
        </tbody>

        <tfoot>
          {slip.base_salary > 0 && (
            <tr className="border-t">
              <td colSpan={COLUMNS - 1} className="px-3 py-2.5 font-medium">
                เงินเดือนฐาน
              </td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                {fmtMoney(slip.base_salary)}
              </td>
            </tr>
          )}

          {slip.adjustments.map((a, i) => (
            <tr key={a.id || `adj-${i}`} className="border-t">
              <td colSpan={COLUMNS - 1} className="px-3 py-2 text-muted-foreground">
                รายการปรับมือ · {a.label || '(ไม่มีชื่อรายการ)'}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
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
              </td>
            </tr>
          ))}

          {editable && (
            <AddAdjustmentRow slipId={slip.id} onSlipChange={onSlipChange} />
          )}

          <tr className="border-t bg-muted/60">
            <td colSpan={COLUMNS - 1} className="px-3 py-3 font-semibold">
              ยอดสุทธิ
            </td>
            <td className="px-3 py-3 text-right text-base font-semibold tabular-nums">
              {fmtMoney(slip.total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// แถวท้ายตาราง
// ────────────────────────────────────────────────────────────────────────────

/**
 * "เพิ่มเช็คอินที่ลืม" — กรอกวันที่/เวลา/หน้าที่/อีเวนต์ในแถวเดียวแล้ว Enter
 * ใช้ช่องชุดเดียวกับในแถวปกติ โดยให้ onSave เก็บลง state แทนการยิง server
 */
function AddCheckinRow({
  slipId, periodStart, periodEnd, duties, events, onSlipChange,
}: {
  slipId: string
  periodStart: string
  periodEnd: string
  duties: SalaryDutyRow[]
  events: SlipEventOption[]
  onSlipChange: (slip: SlipDetail) => void
}) {
  const router = useRouter()
  const [date, setDate] = useState('')
  const [inTime, setInTime] = useState('')
  const [outTime, setOutTime] = useState('')
  const [selectedDuties, setSelectedDuties] = useState<string[]>([])
  const [eventId, setEventId] = useState<string | null>(null)
  const [outOfProvince, setOutOfProvince] = useState(false)
  const [isPending, startTransition] = useTransition()

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

  return (
    <tr className="border-b bg-muted/20">
      <td className="px-3 py-2.5">
        <input
          type="date"
          value={date}
          min={periodStart || undefined}
          max={periodEnd || undefined}
          aria-label="วันที่ของเช็คอินที่ลืม"
          onChange={e => setDate(e.target.value)}
          onKeyDown={onEnter}
          className="border-input h-7 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
        />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <input
            type="time"
            value={inTime}
            aria-label="เวลาเข้าของเช็คอินที่ลืม"
            onChange={e => setInTime(e.target.value)}
            onKeyDown={onEnter}
            className="border-input h-7 w-26 rounded-md border bg-transparent px-2 text-sm tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="time"
            value={outTime}
            aria-label="เวลาออกของเช็คอินที่ลืม"
            onChange={e => setOutTime(e.target.value)}
            onKeyDown={onEnter}
            className="border-input h-7 w-26 rounded-md border bg-transparent px-2 text-sm tabular-nums shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
          />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <DutiesCell
          value={selectedDuties}
          duties={duties}
          ariaLabel="หน้าที่ของเช็คอินที่ลืม"
          onSave={async next => { setSelectedDuties(next); return {} }}
        />
      </td>
      <td className="px-3 py-2.5">
        <EventCell
          value={eventId}
          events={events}
          onSave={async next => { setEventId(next); return {} }}
        />
      </td>
      <td className="px-3 py-2.5">
        <ToggleCell
          value={outOfProvince}
          ariaLabel="ต่างจังหวัดของเช็คอินที่ลืม"
          onSave={async next => { setOutOfProvince(next); return {} }}
        />
      </td>
      <td colSpan={COLUMNS - 5} className="px-3 py-2.5 text-right">
        <Button type="button" size="sm" className="h-7" disabled={isPending} onClick={submit}>
          <Plus className="size-4" />
          เพิ่มเช็คอินที่ลืม
        </Button>
      </td>
    </tr>
  )
}

/** เพิ่มรายการปรับมือในแถว — จำนวนติดลบได้ (หัก) แต่เป็นศูนย์ไม่ได้ */
function AddAdjustmentRow({
  slipId, onSlipChange,
}: {
  slipId: string
  onSlipChange: (slip: SlipDetail) => void
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
    <tr className="border-t">
      <td colSpan={COLUMNS - 1} className="px-3 py-2">
        <Input
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="เพิ่มรายการปรับมือ เช่น โบนัส / หักประกันสังคม"
          aria-label="ชื่อรายการปรับมือ"
          className="h-8 max-w-96"
        />
      </td>
      <td className="px-3 py-2 text-right">
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
      </td>
    </tr>
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
