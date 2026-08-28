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

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatThaiDate } from '@/lib/thai-date'
import { fmtMoney } from '../format'
import type { SlipCheckinRow, SlipDetail, SlipEventOption } from '../actions'
import { bangkokParts, shiftDay } from '../compute'
import type { SalaryDutyRow } from '../settings/actions'
import {
  DutiesCell, EventCell, MoneyCell, RunnerCell, TimeCell, ToggleCell,
} from './components/inline-cells'
import { CHECK_TYPE_LABEL, toISO } from './components/day-view-utils'
import AddCheckinForm from './components/add-checkin-form'
import SlipFooter from './components/slip-footer'
import { useDayView, useSlipEdits } from './components/use-slip-edits'

interface Props {
  slip: SlipDetail
  /** เช็คอินต้นทางในงวด — ว่างเมื่อไม่ใช่ admin (ตารางจะเหลือแต่บรรทัดเงินรายวัน) */
  checkins: SlipCheckinRow[]
  duties: SalaryDutyRow[]
  events: SlipEventOption[]
  /** admin + สลิปร่างเท่านั้น — ที่เหลืออ่านอย่างเดียว (server ตรวจซ้ำทุก action) */
  editable: boolean
  /** วันไทยที่เพิ่งถูกคลิกจาก checklist งานค้าง — แถวของวันนั้นถูกไฮไลต์ชั่วคราว */
  highlightDate?: string | null
  /** สลิปที่ action คืนกลับมาหลังบันทึก — ตัวเรียกเก็บไว้ใน state */
  onSlipChange: (slip: SlipDetail) => void
}

/** จำนวนคอลัมน์ของตาราง — ใช้กับ colSpan ของแถวท้ายตาราง */
const COLUMNS = 10

export default function SlipDayTable({
  slip, checkins, duties, events, editable, highlightDate, onSlipChange,
}: Props) {
  const { days, dutyName, emptyRunnerKeys, applyRunnerKey } =
    useDayView(slip, checkins, duties, editable)
  const { saveCheckin, saveOverride, clearOverride, saveRunner, applyRunnerToEmpty } =
    useSlipEdits(slip.id, onSlipChange)

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
              const inAt = c ? bangkokParts(c.checked_in_at) : null
              const outAt = c?.checked_out_at ? bangkokParts(c.checked_out_at) : null
              const oopLine = sub?.oopLine
              const otLine = day.otLine

              return (
                <tr
                  key={c ? c.id : day.date}
                  id={idx === 0 ? `day-${day.date}` : undefined}
                  className={cn(
                    'border-b align-top',
                    paidElsewhere && 'text-muted-foreground',
                    // คลิกจาก checklist งานค้าง — ไฮไลต์ทุกแถวย่อยของวันนั้น 2 วิ
                    highlightDate === day.date && 'ring-2 ring-amber-400 ring-inset'
                  )}
                >
                  {idx === 0 && (
                    <td rowSpan={span} className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{formatThaiDate(day.date)}</span>
                        {day.warnings.length > 0 && (
                          // รายละเอียด/ปุ่ม "ยอมรับ" อยู่ใน checklist งานค้างเหนือตาราง
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
                            overnightFrom={inAt}
                            onSave={(t, overnight) =>
                              saveCheckin(c.id, {
                                checked_out_at:
                                  t === null
                                    ? null
                                    : toISO(overnight ? shiftDay(inAt.date, 1) : inAt.date, t),
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
                                applyRunnerKey === l.key
                                  ? amount => applyRunnerToEmpty(emptyRunnerKeys, amount)
                                  : undefined
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
            <AddCheckinForm
              slipId={slip.id}
              periodStart={slip.period_start}
              periodEnd={slip.period_end}
              duties={duties}
              events={events}
              onSlipChange={onSlipChange}
              variant="row"
              columns={COLUMNS}
            />
          )}
        </tbody>

        <SlipFooter
          slip={slip}
          editable={editable}
          onSlipChange={onSlipChange}
          variant="table"
          columns={COLUMNS}
        />
      </table>
    </div>
  )
}
