'use client'

// ขั้น "คืนชั้น" (ใบคืนแล้ว) — ทีมจัดของนำของจากจุดรับของขึ้นชั้นบ้านเดิม เรียงเส้นทาง ห้อง › ตู้ › ชั้น (pickRoute ตามชั้นของหน่วย — กระเป๋าใช้ชั้นของกระเป๋า)
// ต่อบรรทัด: ป้ายสภาพตอนคืน + ปุ่ม "คืนชั้นแล้ว" (≥44px) → restockLine · บรรทัดที่คืนชั้นแล้วแสดงเครื่องหมาย
// ปุ่ม "คืนชั้นทั้งหมด" (useConfirm) → restockAll · กล่องแดงสรุปของเสีย/ซ่อม/หาย · แถบล่าง "คืนชั้นแล้ว x/y"
// คืนชั้นทำได้แม้อีเวนต์ยังไม่ปิด (ป้ายเตือนรอผู้มีสิทธิ์ปิดงาน) · action revalidatePath หน้านี้อยู่แล้ว
import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check, CheckCheck, Clock, Loader2, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useConfirm } from '../../finance/use-confirm'
import { isClosedEvent } from '../../jobs/tracking/tracking-logic'
import { restockAll, restockLine } from '../actions'
import { RETURN_CONDITION_LABELS, isReturnCondition, statusLabel } from '../packing-logic'
import { ReturnConditionBadge } from '../status-chip'
import type { PackingLineView, PackingListDetail } from '../types'
import { PhotoGrid, Timeline, whenBy } from './out-summary'
import { lineTags, routeOf } from './pick-step'

const PROBLEM = new Set(['damaged', 'maintenance', 'lost'])

/** ของที่มีปัญหาหลังคืน: บรรทัดที่สภาพไม่ใช่ใช้ได้ + ชิ้นในกระเป๋าที่เสีย/ซ่อม/หาย */
export function restockProblems(lines: PackingLineView[]): string[] {
  const out: string[] = []
  for (const l of lines) {
    if (l.return_condition && l.return_condition !== 'available') out.push(`${l.unitName} — ${RETURN_CONDITION_LABELS[l.return_condition]}`)
    for (const i of l.kitItems ?? []) {
      if (!i.is_consumable && !i.outElsewhere && PROBLEM.has(i.status)) {
        out.push(`${i.name} (ใน ${l.unitName}) — ${isReturnCondition(i.status) ? RETURN_CONDITION_LABELS[i.status] : statusLabel(i.status)}`)
      }
    }
  }
  return out
}

/** สิ่งที่จะเกิดเมื่อคืนชั้นบรรทัดนี้ */
function restockHint(l: PackingLineView): string {
  if (l.kind === 'kit') {
    const n = (l.kitItems ?? []).filter(i => !i.is_consumable && !i.outElsewhere && i.status === 'in_use').length
    return n > 0 ? `ของในกระเป๋า ${n} ชิ้นกลับเป็นใช้ได้` : 'ไม่มีชิ้นที่ต้องเปลี่ยนสถานะ'
  }
  const c = l.return_condition ?? 'available'
  return c === 'available' ? 'สถานะกลับเป็นใช้ได้' : `สถานะคงเป็น${RETURN_CONDITION_LABELS[c]}`
}

export default function RestockStep({ detail }: { detail: PackingListDetail }) {
  const { list } = detail
  const [busy, setBusy] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const total = detail.lines.length
  const done = detail.lines.filter(l => l.restocked_at).length
  const remaining = total - done
  const problems = restockProblems(detail.lines)
  const eventOpen = !isClosedEvent(detail.event.status)

  const finish = (listDone: boolean, ok: string) => toast.success(listDone ? 'คืนชั้นครบแล้ว — จบใบจัดของนี้' : ok)

  const one = async (l: PackingLineView) => {
    setBusy(l.id)
    const res = await restockLine(l.id)
    setBusy(null)
    if ('error' in res) toast.error(res.error)
    else finish(res.listDone, `คืนชั้น "${l.unitName}" แล้ว`)
  }

  const all = async () => {
    const ok = await confirm({
      title: `คืนชั้นทั้งหมด ${remaining} รายการ?`,
      description: 'ยืนยันว่านำของทุกรายการที่เหลือขึ้นชั้นบ้านเดิมแล้ว — ของที่ใช้ได้จะกลับเป็นสถานะใช้ได้ ของเสีย/ซ่อม/หายคงสถานะเดิม',
      variant: 'warning',
      confirmLabel: 'คืนชั้นทั้งหมด',
    })
    if (!ok) return
    setBusy('all')
    const res = await restockAll(list.id)
    setBusy(null)
    if ('error' in res) toast.error(res.error)
    else finish(res.listDone, 'คืนชั้นแล้ว')
  }

  return (
    <div className="space-y-4" data-testid="restock-step">
      <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-3 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
        <div className="font-semibold">คืนแล้ว — รอคืนชั้น</div>
        <div className="mt-0.5 text-sm">คืนของเมื่อ {whenBy(detail, list.returned_at, list.returned_by)}</div>
        <div className="mt-0.5 text-sm">ของวางอยู่ที่ {detail.spot?.name ?? 'จุดรับของ'} — นำขึ้นชั้นบ้านเดิมทีละรายการ</div>
      </div>

      {eventOpen && (
        <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100" data-testid="event-open">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>อีเวนต์ยังไม่ปิด — รอผู้มีสิทธิ์ปิดงาน (คืนชั้นต่อได้เลย ไม่ต้องรอ)</span>
        </div>
      )}

      {problems.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" data-testid="restock-problems">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" /> ของที่มีปัญหา {problems.length} รายการ
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {problems.map(p => (
              <li key={p} className="wrap-break-word">
                {p}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">ขึ้นชั้นได้ตามปกติ — สถานะคงเป็นเสีย/ซ่อม/หาย และขึ้นในแดชบอร์ดสต็อก “มีปัญหา”</p>
        </div>
      )}

      <Timeline detail={detail} />
      {list.return_note && (
        <div className="rounded-lg bg-zinc-50 p-3 text-sm wrap-break-word dark:bg-zinc-900">
          <span className="font-medium">หมายเหตุตอนคืน:</span> {list.return_note}
        </div>
      )}
      <PhotoGrid urls={list.return_photo_urls} alt="รูปตอนคืนของ" />

      {routeOf(detail.lines).map(g => (
        <section key={g.key} className="space-y-2">
          <h3 className="sticky top-0 z-[1] flex items-center gap-1.5 bg-zinc-50/95 py-1 text-sm font-semibold backdrop-blur dark:bg-zinc-900/95">
            <MapPin className="h-4 w-4 shrink-0 text-violet-600" />
            <span className="wrap-break-word">{g.label}</span>
            <span className="font-normal text-zinc-400 tabular-nums">
              ({g.lines.filter(l => l.restocked_at).length}/{g.lines.length})
            </span>
          </h3>
          <ul className="space-y-2">
            {g.lines.map(l => {
              const restocked = !!l.restocked_at
              return (
                <li
                  key={l.id}
                  className={cn(
                    'flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between',
                    restocked ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950',
                  )}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {restocked && <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="คืนชั้นแล้ว" />}
                      <span className="font-semibold wrap-break-word">{l.unitName}</span>
                      <ReturnConditionBadge condition={l.return_condition} />
                    </div>
                    <div className="text-xs text-zinc-500 wrap-break-word">
                      {l.serial && <>S/N {l.serial} · </>}
                      {lineTags(l)}
                    </div>
                    {l.return_note && <div className="text-xs text-zinc-600 wrap-break-word dark:text-zinc-400">หมายเหตุ: {l.return_note}</div>}
                    <div className="text-xs text-zinc-500">{restocked ? `คืนชั้นแล้ว ${whenBy(detail, l.restocked_at, l.restocked_by)}` : restockHint(l)}</div>
                  </div>
                  {!restocked && (
                    <Button className="min-h-11 shrink-0 bg-emerald-600 text-white hover:bg-emerald-700 sm:min-w-32" disabled={busy !== null} onClick={() => one(l)}>
                      {busy === l.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                      คืนชั้นแล้ว
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <div className="sticky bottom-0 z-10 -mx-1 space-y-2 border-t border-zinc-200 bg-white/95 px-1 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-semibold tabular-nums">
            คืนชั้นแล้ว {done}/{total}
          </span>
          {remaining > 0 && (
            <Button variant="outline" className="min-h-11" disabled={busy !== null} onClick={all}>
              {busy === 'all' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-1 h-4 w-4" />}
              คืนชั้นทั้งหมด
            </Button>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
        </div>
      </div>
      {dialog}
    </div>
  )
}
