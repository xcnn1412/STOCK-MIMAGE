// ============================================================================
// ตารางบรรทัดของสลิป — เงินเดือนฐาน + บรรทัดที่คำนวณ (จัดกลุ่มตามวัน) +
// รายการปรับมือ + ยอดสุทธิ
//
// ตอนนี้อ่านอย่างเดียว แยกเป็นคอมโพเนนต์ของตัวเองเพราะขั้นถัดไป (แก้มือ/รายการปรับมือ)
// จะมาโตต่อในไฟล์นี้ — หน้าสลิปจะได้ไม่บวม
// ============================================================================

import { Fragment } from 'react'
import { formatThaiDate } from '@/lib/thai-date'
import { fmtMoney } from '../format'
import { lineAmount, type EmploymentType, type LineKind, type SalaryAdjustment, type SalaryLine } from '../compute'

const KIND_LABEL: Record<LineKind, string> = {
  ot: 'OT',
  site: 'ค่าสตาฟ',
  oop: 'เบิ้ลต่างจังหวัด',
  runner: 'รันเนอร์',
}

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
}

/** บรรทัดที่ยังไม่กรอกยอด (รันเนอร์) — นับเป็น 0 ในยอดรวมแต่ปิดงวดไม่ได้ */
function isMissing(l: SalaryLine): boolean {
  return l.amount === null || l.amount === undefined
}

export default function SlipLinesTable({
  lines, adjustments, employmentType, baseSalary, total,
}: Props) {
  // จัดกลุ่มตามวัน โดยคงลำดับที่เครื่องคำนวณเรียงมาแล้ว (วัน → ชนิด → label)
  const groups: { date: string; lines: SalaryLine[] }[] = []
  for (const line of lines) {
    const last = groups[groups.length - 1]
    if (last && last.date === line.date) last.lines.push(line)
    else groups.push({ date: line.date, lines: [line] })
  }

  const adjustTotal = adjustments.reduce((sum, a) => sum + Number(a.amount || 0), 0)

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
          {employmentType === 'fulltime' && (
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
                        {KIND_LABEL[l.kind]}
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
                    {isMissing(l) ? (
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-500">
                        ยังไม่กรอก
                      </span>
                    ) : l.override_note ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-xs text-muted-foreground line-through">
                          {fmtMoney(l.computed_amount)}
                        </span>
                        <span className="font-medium">{fmtMoney(lineAmount(l))}</span>
                      </span>
                    ) : (
                      fmtMoney(lineAmount(l))
                    )}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}

          {/* รายการปรับมือ — โบนัส/หัก ที่ admin เพิ่มเอง (± ได้) */}
          {adjustments.length > 0 && (
            <>
              <tr className="border-b bg-muted/40">
                <td colSpan={2} className="px-4 py-1.5 text-xs font-medium text-muted-foreground">
                  รายการปรับมือ
                </td>
              </tr>
              {adjustments.map((a, i) => (
                <tr key={a.id || `adj-${i}`} className="border-b">
                  <td className="px-4 py-2.5">{a.label || '(ไม่มีชื่อรายการ)'}</td>
                  <td
                    className={`px-4 py-2.5 text-right tabular-nums ${
                      Number(a.amount || 0) < 0 ? 'text-red-600 dark:text-red-400' : ''
                    }`}
                  >
                    {fmtMoney(a.amount)}
                  </td>
                </tr>
              ))}
              <tr className="border-b">
                <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                  รวมรายการปรับมือ
                </td>
                <td className="px-4 py-2 text-right text-xs tabular-nums text-muted-foreground">
                  {fmtMoney(adjustTotal)}
                </td>
              </tr>
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
