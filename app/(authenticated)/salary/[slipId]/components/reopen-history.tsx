'use client'

// ============================================================================
// ประวัติการเปิดแก้ + ประวัติการจ่าย ท้ายสลิป — spec §"เปิดแก้ไขหลังปิดงวด"
//
// แสดงทั้ง admin และเจ้าของสลิป: ใครเปิดแก้ เมื่อไร เพราะอะไร ยอดก่อน → หลัง
// (ยอดหลัง = "กำลังแก้ไข" ระหว่างที่ยังไม่ได้ปิดงวดใหม่)
// ประวัติการจ่ายแสดงเมื่อจ่ายมากกว่า 1 ครั้ง — ครั้งเดียวมีบรรทัดสรุปท้ายหน้าอยู่แล้ว
// ============================================================================

import { History } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatThaiDate } from '@/lib/thai-date'
import { fmtMoney } from '../../format'
import type { SlipDetail } from '../../actions'

interface Props {
  slip: SlipDetail
}

export default function ReopenHistory({ slip }: Props) {
  const reopens = slip.reopen_history ?? []
  const paids = slip.paid_history ?? []
  if (reopens.length === 0 && paids.length <= 1) return null

  return (
    <Card>
      <CardContent className="space-y-2 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <History className="size-4 text-muted-foreground" />
          ประวัติการแก้ไข
        </p>

        {reopens.length === 0 ? (
          <p className="text-muted-foreground">ยังไม่เคยเปิดแก้ไขสลิปใบนี้</p>
        ) : (
          <ul className="space-y-1">
            {reopens.map((r, i) => (
              <li key={`${r.at}-${i}`} className="text-muted-foreground">
                <span className="font-medium text-foreground">แก้ไขครั้งที่ {i + 1}</span>
                {' · '}{formatThaiDate(r.at)}
                {' · โดย '}{r.by_name || 'ไม่ทราบชื่อ'}
                {' · เหตุผล '}{r.reason}
                {' · ยอด '}{fmtMoney(r.total_before)}
                {' → '}
                {r.total_after === null ? 'กำลังแก้ไข' : fmtMoney(r.total_after)}
              </li>
            ))}
          </ul>
        )}

        {paids.length > 1 && (
          <div className="border-t pt-2">
            <p className="font-medium">ประวัติการจ่าย</p>
            <ul className="space-y-1">
              {paids.map((p, i) => (
                <li key={`${p.at}-${i}`} className="text-muted-foreground">
                  จ่ายแล้ว {formatThaiDate(p.at)} · {fmtMoney(p.total)} บาท
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
