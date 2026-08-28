'use client'

// ============================================================================
// การ์ดรายวันของสลิป (มือถือ < md) — spec: docs/specs/salary-slip-daily-ui.md
//
// 1 วัน = 1 การ์ด: หัวการ์ดสรุป (วันที่ · ชื่ออีเวนต์ · รวมวัน · ไอคอนเตือน)
// บรรทัดย่อยต่อเช็คอิน (ประเภท · เข้า–ออก · หน้าที่ · ตจว.) แตะการ์ดแล้วเปิด
// "แผงแก้" ใต้การ์ด — ช่องชุดเดียวกับตารางเดสก์ท็อป แต่เรียงแนวตั้งเป็นป้าย/ค่า
//
// ใช้ groupSlipByDay/useSlipEdits/SlipFooter/AddCheckinForm ร่วมกับตารางเดสก์ท็อป
// ทั้งคู่ถูก render พร้อมกันแล้วสลับด้วย CSS — id ของการ์ดจึงลงท้าย '-m'
// เพื่อไม่ให้ชนกับ id ของแถวในตาราง (jumpToDay เลือกตัวที่มองเห็นอยู่)
// ============================================================================

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMoney, shortThaiDate } from '../format'
import type { SlipCheckinRow, SlipDetail, SlipEventOption } from '../actions'
import { groupSlipByDay, type DayRow, type SalaryLine } from '../compute'
import type { SalaryDutyRow } from '../settings/actions'
import {
  DutiesCell, EventCell, MoneyCell, RunnerCell, TimeCell, ToggleCell,
} from './components/inline-cells'
import {
  bkkParts, checkoutDateFor, CHECK_TYPE_LABEL, isMissing, toISO,
} from './components/day-view-utils'
import AddCheckinForm from './components/add-checkin-form'
import PanelRow from './components/panel-row'
import SlipFooter from './components/slip-footer'
import { useSlipEdits, type SlipEdits } from './components/use-slip-edits'

interface Props {
  slip: SlipDetail
  /** เช็คอินต้นทางในงวด — ของ admin แก้ได้ ของเจ้าของสลิปอ่านอย่างเดียว */
  checkins: SlipCheckinRow[]
  duties: SalaryDutyRow[]
  events: SlipEventOption[]
  /** admin + สลิปร่างเท่านั้น — ที่เหลืออ่านอย่างเดียว (server ตรวจซ้ำทุก action) */
  editable: boolean
  /** วันไทยที่เพิ่งถูกคลิกจาก checklist งานค้าง — การ์ดของวันนั้นถูกไฮไลต์ชั่วคราว */
  highlightDate?: string | null
  /** สลิปที่ action คืนกลับมาหลังบันทึก — ตัวเรียกเก็บไว้ใน state */
  onSlipChange: (slip: SlipDetail) => void
}

export default function SlipDayCards({
  slip, checkins, duties, events, editable, highlightDate, onSlipChange,
}: Props) {
  const days = groupSlipByDay(slip.lines, checkins, slip.warnings)
  const dutyName = new Map(duties.map(d => [d.code, d.name_th]))
  const edits = useSlipEdits(slip.id, onSlipChange)

  // รันเนอร์ทั้งใบ — ใช้ตัดสินว่าช่องไหนได้ปุ่ม "ใช้ยอดนี้กับวันที่ยังว่าง"
  const runnerLines = days.flatMap(d => d.runnerLines)
  const emptyRunnerKeys = runnerLines.filter(isMissing).map(l => l.key)
  const firstFilledRunner = runnerLines.find(l => !isMissing(l))
  const applyRunnerKey =
    editable && firstFilledRunner && emptyRunnerKeys.length > 0 ? firstFilledRunner.key : null

  return (
    <div className="space-y-2">
      {days.length === 0 && (
        <p className="rounded-md border px-3 py-8 text-center text-sm text-muted-foreground">
          ไม่มีรายการในงวดนี้
        </p>
      )}

      {days.map(day => (
        <DayCard
          key={day.date}
          day={day}
          slipId={slip.id}
          duties={duties}
          events={events}
          dutyName={dutyName}
          editable={editable}
          highlighted={highlightDate === day.date}
          edits={edits}
          applyRunnerKey={applyRunnerKey}
          emptyRunnerKeys={emptyRunnerKeys}
        />
      ))}

      {editable && (
        <AddCheckinForm
          slipId={slip.id}
          periodStart={slip.period_start}
          periodEnd={slip.period_end}
          duties={duties}
          events={events}
          onSlipChange={onSlipChange}
          variant="stacked"
        />
      )}

      <SlipFooter
        slip={slip}
        editable={editable}
        onSlipChange={onSlipChange}
        variant="stacked"
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// การ์ดของหนึ่งวัน
// ────────────────────────────────────────────────────────────────────────────

interface DayCardProps {
  day: DayRow<SlipCheckinRow>
  slipId: string
  duties: SalaryDutyRow[]
  events: SlipEventOption[]
  dutyName: Map<string, string>
  editable: boolean
  highlighted: boolean
  edits: SlipEdits
  /** บรรทัดรันเนอร์ที่ได้ปุ่ม "ใช้ยอดนี้กับวันที่ยังว่าง" (ทั้งใบมีได้ช่องเดียว) */
  applyRunnerKey: string | null
  emptyRunnerKeys: string[]
}

function DayCard({
  day, slipId, duties, events, dutyName, editable, highlighted, edits,
  applyRunnerKey, emptyRunnerKeys,
}: DayCardProps) {
  const [open, setOpen] = useState(false)

  const eventNames = Array.from(
    new Set(day.checkins.map(s => s.checkin.event_name).filter((n): n is string => !!n))
  ).join(' · ')

  const summary = amountSummary(day, dutyName)
  const otLine = day.otLine

  const header = (
    <>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <span>{shortThaiDate(day.date)}</span>
          {day.warnings.length > 0 && (
            // รายละเอียด/ปุ่ม "ยอมรับ" อยู่ใน checklist งานค้างเหนือรายการ
            <span
              title={day.warnings.map(w => w.message).join('\n')}
              aria-label={`คำเตือน ${day.warnings.length} ข้อ`}
            >
              <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-500" />
            </span>
          )}
        </div>
        {eventNames && (
          <p className="truncate text-xs text-muted-foreground">{eventNames}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-sm font-medium tabular-nums">{fmtMoney(day.dayTotal)}</span>
        {editable && (
          <ChevronDown
            className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        )}
      </div>
    </>
  )

  return (
    <div
      id={`day-${day.date}-m`}
      className={cn(
        'overflow-hidden rounded-md border',
        highlighted && 'ring-2 ring-amber-400 ring-inset'
      )}
    >
      {editable ? (
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-label={`แผงแก้ของวันที่ ${shortThaiDate(day.date)}`}
          className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-muted/50"
        >
          {header}
        </button>
      ) : (
        <div className="flex items-start gap-2 px-3 py-2.5">{header}</div>
      )}

      {/* ── บรรทัดย่อยต่อเช็คอิน + สรุปยอดของวัน ─────────────────────────── */}
      <div className="space-y-1 px-3 pb-2.5 text-xs text-muted-foreground">
        {day.checkins.map(sub => {
          const c = sub.checkin
          const inAt = bkkParts(c.checked_in_at)
          const outAt = c.checked_out_at ? bkkParts(c.checked_out_at) : null
          const names = c.duties.map(code => dutyName.get(code) || code).join(', ')
          const paidElsewhere = !!c.paid_slip_id && c.paid_slip_id !== slipId
          return (
            <p key={c.id} className="flex flex-wrap items-center gap-x-1.5">
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                {CHECK_TYPE_LABEL[c.check_type]}
              </span>
              <span className="tabular-nums">
                {inAt.time}–{outAt ? outAt.time : 'ยังไม่ออก'}
              </span>
              {names && <span className="truncate">· {names}</span>}
              {c.out_of_province && <span>· ตจว.</span>}
              {paidElsewhere && (
                <Link
                  href={`/salary/${c.paid_slip_id}`}
                  className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
                >
                  จ่ายในสลิปอื่น
                </Link>
              )}
            </p>
          )
        })}
        {summary && <p>{summary}</p>}
      </div>

      {/* ── แผงแก้ใต้การ์ด — ช่องเดียวกับเดสก์ท็อป เรียงเป็นป้าย/ค่า ───────── */}
      {editable && open && (
        <div className="space-y-3 border-t bg-muted/20 px-3 py-3">
          {day.checkins.map(sub => {
            const c = sub.checkin
            const paidElsewhere = !!c.paid_slip_id && c.paid_slip_id !== slipId
            const rowEditable = !paidElsewhere
            const onsite = c.check_type === 'onsite'
            const inAt = bkkParts(c.checked_in_at)
            const outAt = c.checked_out_at ? bkkParts(c.checked_out_at) : null
            const oopLine = sub.oopLine

            return (
              <div key={c.id} className="space-y-2 rounded-md border bg-background p-2.5">
                <p className="text-xs font-medium">
                  เช็คอิน{CHECK_TYPE_LABEL[c.check_type]}
                  {paidElsewhere && ' · จ่ายในสลิปอื่นแล้ว แก้ไม่ได้'}
                </p>

                <PanelRow label="เวลาเข้า">
                  <TimeCell
                    value={inAt.time}
                    disabled={!rowEditable}
                    ariaLabel={`เวลาเข้า ${day.date}`}
                    onSave={t =>
                      t
                        ? edits.saveCheckin(c.id, { checked_in_at: toISO(inAt.date, t) })
                        : Promise.resolve({ error: 'เวลาเข้าจะว่างไม่ได้' })
                    }
                  />
                </PanelRow>

                <PanelRow label="เวลาออก">
                  <TimeCell
                    value={outAt?.time ?? null}
                    allowClear
                    placeholder="ยังไม่ออก"
                    disabled={!rowEditable}
                    ariaLabel={`เวลาออก ${day.date}`}
                    onSave={t =>
                      edits.saveCheckin(c.id, {
                        checked_out_at:
                          t === null ? null : toISO(checkoutDateFor(inAt.date, inAt.time, t), t),
                      })
                    }
                  />
                </PanelRow>

                {onsite && (
                  <>
                    <PanelRow label="หน้าที่">
                      <DutiesCell
                        value={c.duties}
                        duties={duties}
                        disabled={!rowEditable}
                        ariaLabel={`หน้าที่ ${day.date}`}
                        onSave={next => edits.saveCheckin(c.id, { duties: next })}
                      />
                    </PanelRow>
                    <PanelRow label="อีเวนต์">
                      <EventCell
                        value={c.event_id}
                        eventName={c.event_name}
                        events={events}
                        disabled={!rowEditable}
                        onSave={next => edits.saveCheckin(c.id, { event_id: next })}
                      />
                    </PanelRow>
                    <PanelRow label="ตจว.">
                      <ToggleCell
                        value={c.out_of_province}
                        disabled={!rowEditable}
                        ariaLabel={`ต่างจังหวัด ${day.date}`}
                        onSave={next => edits.saveCheckin(c.id, { out_of_province: next })}
                      />
                    </PanelRow>
                  </>
                )}

                {sub.siteLines.map(l => (
                  <PanelRow
                    key={l.key}
                    label={
                      sub.siteLines.length > 1
                        ? `ค่าสตาฟ · ${dutyName.get(l.duty || '') || l.duty}`
                        : 'ค่าสตาฟ'
                    }
                  >
                    <MoneyCell
                      amount={l.amount}
                      computed={l.computed_amount}
                      overrideNote={l.override_note}
                      ariaLabel={`ค่าสตาฟ ${l.label}`}
                      onSave={(amount, note) => edits.saveOverride(l.key, amount, note)}
                      onClear={() => edits.clearOverride(l.key)}
                    />
                  </PanelRow>
                ))}

                {oopLine && (
                  <PanelRow label="เบิ้ลต่างจังหวัด">
                    <MoneyCell
                      amount={oopLine.amount}
                      computed={oopLine.computed_amount}
                      overrideNote={oopLine.override_note}
                      ariaLabel={`เบิ้ลต่างจังหวัด ${day.date}`}
                      onSave={(amount, note) => edits.saveOverride(oopLine.key, amount, note)}
                      onClear={() => edits.clearOverride(oopLine.key)}
                    />
                  </PanelRow>
                )}
              </div>
            )
          })}

          {/* ── เงินระดับวัน: OT (คิดรวมทั้งวัน) + รันเนอร์ ─────────────────── */}
          {(otLine || day.runnerLines.length > 0) && (
            <div className="space-y-2 rounded-md border bg-background p-2.5">
              <p className="text-xs font-medium">เงินของวันนี้</p>

              {otLine && (
                <PanelRow label={`OT · ${otLine.hours ?? 0} ชม.`}>
                  <MoneyCell
                    amount={otLine.amount}
                    computed={otLine.computed_amount}
                    overrideNote={otLine.override_note}
                    ariaLabel={`OT ${day.date}`}
                    onSave={(amount, note) => edits.saveOverride(otLine.key, amount, note)}
                    onClear={() => edits.clearOverride(otLine.key)}
                  />
                </PanelRow>
              )}

              {day.runnerLines.map(l => (
                <PanelRow key={l.key} label="รันเนอร์">
                  <RunnerCell
                    value={l.amount ?? null}
                    ariaLabel={`ยอดรันเนอร์ ${day.date}`}
                    onSave={amount => edits.saveRunner(l.key, amount)}
                    onApplyToEmpty={
                      applyRunnerKey === l.key
                        ? amount => edits.applyRunnerToEmpty(emptyRunnerKeys, amount)
                        : undefined
                    }
                  />
                </PanelRow>
              ))}
            </div>
          )}

          <p className="flex items-center justify-between text-sm font-medium">
            <span>รวมวันนี้</span>
            <span className="tabular-nums">{fmtMoney(day.dayTotal)}</span>
          </p>
        </div>
      )}
    </div>
  )
}

/** สรุปยอดของวันแบบบรรทัดเดียว — 'ค่าสตาฟ 700 · OT 2 ชม. 200 · รันเนอร์ ยังไม่กรอก' */
function amountSummary(day: DayRow<SlipCheckinRow>, dutyName: Map<string, string>): string {
  const parts: string[] = []
  const money = (l: SalaryLine) =>
    isMissing(l) ? 'ยังไม่กรอก' : `${fmtMoney(l.amount)} บาท`

  for (const sub of day.checkins) {
    for (const l of sub.siteLines) {
      const who = dutyName.get(l.duty || '') || l.duty
      parts.push(`${who ? `ค่าสตาฟ ${who}` : 'ค่าสตาฟ'} ${money(l)}`)
    }
    if (sub.oopLine) parts.push(`เบิ้ลต่างจังหวัด ${money(sub.oopLine)}`)
  }
  if (day.otLine) parts.push(`OT ${day.otLine.hours ?? 0} ชม. ${money(day.otLine)}`)
  for (const l of day.runnerLines) parts.push(`รันเนอร์ ${money(l)}`)

  return parts.join(' · ')
}
