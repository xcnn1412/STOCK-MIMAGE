'use client'

// ขั้น "กำลังหยิบ" — รายการเรียงเป็นเส้นทางเดิน ห้อง › ตู้ › ชั้น (pickRoute) · ปุ่ม "หยิบแล้ว" / "ยกเลิกหยิบ" สูง ≥ 44px
// ชิ้นที่หยิบไม่ได้แสดงเหตุผล + ปุ่ม "เปลี่ยนของ" (กล่องเลือกหน่วยอื่นในตัวเลือกเดียวกัน → replacePackingLine)
// ตู้ที่ทีมขายเลือก (locked) เปลี่ยนที่นี่ไม่ได้ — ป้ายแดงให้แจ้งทีมขาย · แถบล่าง "หยิบแล้ว x/y"
import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeftRight, Check, Loader2, Lock, MapPin, RotateCcw, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useConfirm } from '../../finance/use-confirm'
import { allowedUnits } from '../../packages/package-logic'
import type { CategoryUnit } from '../../packages/types'
import { backToSelecting, pickLine, replacePackingLine, unpickLine } from '../actions'
import { pickRoute, requirementKey, statusLabel } from '../packing-logic'
import type { PackingLineView, PackingListDetail } from '../types'
import { UnitSelect, clashQuestion, type EventSlot } from './unit-select'

const PILL = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium'

/** เส้นทางหยิบของบรรทัดในใบ — ตำแหน่งของแต่ละบรรทัดมากับ loader แล้ว (กระเป๋าใช้ชั้นของกระเป๋า) */
export function routeOf(lines: PackingLineView[]) {
  const shelfOf = Object.fromEntries(lines.map(l => [l.unitId, l.place]))
  return pickRoute(lines, shelfOf)
}

/** ป้ายบรรทัด: ชนิด · ประเภท/แพ็กเกจ หรือ ของเสริม */
export function lineTags(l: PackingLineView): string {
  const kind = l.kind === 'kit' ? 'กระเป๋า' : 'อุปกรณ์'
  if (!l.package_id && !l.category_id) return `${kind} · ของเสริม`
  return [kind, l.categoryName, l.packageName].filter(Boolean).join(' · ')
}

function SwapDialog({ line, detail, extraUnits, onClose }: { line: PackingLineView; detail: PackingListDetail; extraUnits: CategoryUnit[]; onClose: () => void }) {
  const [unit, setUnit] = useState<CategoryUnit | null>(null)
  const [saving, setSaving] = useState(false)
  const { confirm, dialog } = useConfirm()
  const event: EventSlot = { eventId: detail.event.id, eventDate: detail.event.event_date, eventTime: detail.event.event_time, eventEndTime: detail.event.event_end_time }
  const req = detail.scaffold.find(r => requirementKey(r.packageId, r.categoryId) === requirementKey(line.package_id, line.category_id))
  const options = req ? allowedUnits(req, detail.unitsByCategory[req.categoryId] ?? []) : extraUnits
  const taken = new Set(detail.lines.map(l => l.unitId))

  const save = async () => {
    if (!unit) return
    setSaving(true)
    const res = await replacePackingLine(line.id, unit.kind === 'kit' ? { kitId: unit.id } : { itemId: unit.id })
    setSaving(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success(`เปลี่ยนเป็น "${unit.name}" แล้ว`)
    onClose()
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[85vh] w-[95vw] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>เปลี่ยนของ</DialogTitle>
          <DialogDescription>
            แทน “{line.unitName}” ด้วยหน่วยอื่น{req ? `ในตัวเลือกของ ${req.categoryName}` : 'ในคลัง'} ที่หยิบได้ตอนนี้
          </DialogDescription>
        </DialogHeader>
        <UnitSelect
          units={options}
          value={unit?.id ?? ''}
          allowNone={false}
          requirePickable
          onChange={async (u, a) => {
            if (u && a) {
              const q = clashQuestion(u, a)
              if (q && !(await confirm({ ...q, variant: 'warning', confirmLabel: 'เลือกหน่วยนี้' }))) return
            }
            setUnit(u)
          }}
          event={event}
          bookings={detail.bookings}
          taken={taken}
          placeholder="เลือกหน่วยที่จะใช้แทน"
        />
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button className="min-h-11" disabled={!unit || saving} onClick={save}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            เปลี่ยนของ
          </Button>
        </DialogFooter>
        {dialog}
      </DialogContent>
    </Dialog>
  )
}

function LineRow({ line, busy, onPick, onUnpick, onSwap }: { line: PackingLineView; busy: boolean; onPick: () => void; onUnpick: () => void; onSwap: () => void }) {
  const picked = !!line.picked_at
  return (
    <li className={cn('space-y-2 rounded-lg border p-3', picked ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950')}>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {picked && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
          <span className="font-semibold wrap-break-word">{line.unitName}</span>
          {line.locked && (
            <span className={cn(PILL, 'gap-1 bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200')}>
              <Lock className="h-3 w-3" /> ทีมขายเลือก
            </span>
          )}
          {line.variant && <span className={cn(PILL, 'bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200')}>{line.variant}</span>}
        </div>
        <div className="text-xs text-zinc-500 wrap-break-word">
          {line.serial && <span>S/N {line.serial} · </span>}
          {lineTags(line)}
        </div>
        {line.kind === 'kit' && line.kitItems && line.kitItems.length > 0 && (
          <details className="text-xs text-zinc-600 dark:text-zinc-400">
            <summary className="cursor-pointer py-1">ของในกระเป๋า {line.kitItems.filter(i => !i.is_consumable).length} ชิ้น</summary>
            <ul className="mt-1 space-y-0.5 pl-4">
              {line.kitItems.map(i => (
                <li key={i.id} className={cn(i.status !== 'available' && i.status !== 'in_use' && 'text-red-600 dark:text-red-400')}>
                  {i.name}
                  {i.is_consumable ? ' (วัสดุสิ้นเปลือง)' : i.status !== 'available' ? ` · ${statusLabel(i.status)}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
        {!picked && line.pickBlock && (
          <div className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {line.locked ? `${line.pickBlock} — ตู้ที่ขายไว้ใช้ไม่ได้ แจ้งทีมขายเปลี่ยน` : line.pickBlock}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {picked ? (
          <Button variant="outline" className="min-h-11" disabled={busy} onClick={onUnpick}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-1 h-4 w-4" />}
            ยกเลิกหยิบ
          </Button>
        ) : line.pickBlock ? (
          !line.locked && (
            <Button variant="outline" className="min-h-11 border-amber-300 text-amber-800 dark:text-amber-200" onClick={onSwap}>
              <ArrowLeftRight className="mr-1 h-4 w-4" /> เปลี่ยนของ
            </Button>
          )
        ) : (
          <Button className="min-h-11 bg-emerald-600 text-white hover:bg-emerald-700 sm:min-w-32" disabled={busy} onClick={onPick}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
            หยิบแล้ว
          </Button>
        )}
      </div>
    </li>
  )
}

export default function PickStep({ detail, extraUnits }: { detail: PackingListDetail; extraUnits: CategoryUnit[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [swapping, setSwapping] = useState<PackingLineView | null>(null)
  const { confirm, dialog } = useConfirm()
  const groups = routeOf(detail.lines)
  const picked = detail.lines.filter(l => l.picked_at).length
  const total = detail.lines.length

  const run = async (lineId: string, action: () => Promise<{ error: string } | { success: true }>, ok: string) => {
    setBusy(lineId)
    const res = await action()
    setBusy(null)
    if ('error' in res) toast.error(res.error)
    else toast.success(ok)
  }

  const back = async () => {
    const ok = await confirm({
      title: 'กลับไปแก้รายการ?',
      description: 'ใบจะกลับเป็นขั้นเลือกของ แก้ของในใบได้ แล้วกด "สร้างใบจัดของ" อีกครั้ง',
      variant: 'warning',
      confirmLabel: 'กลับไปเลือกของ',
    })
    if (!ok) return
    setBusy('back')
    const res = await backToSelecting(detail.list.id)
    setBusy(null)
    if ('error' in res) toast.error(res.error)
  }

  return (
    <div className="space-y-4">
      {total === 0 && <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">ใบนี้ยังไม่มีของ</div>}
      {groups.map(g => (
        <section key={g.key} className="space-y-2">
          <h3 className="sticky top-0 z-[1] flex items-center gap-1.5 bg-zinc-50/95 py-1 text-sm font-semibold backdrop-blur dark:bg-zinc-900/95">
            <MapPin className="h-4 w-4 shrink-0 text-violet-600" />
            <span className="wrap-break-word">{g.label}</span>
            <span className="font-normal text-zinc-400 tabular-nums">({g.lines.filter(l => l.picked_at).length}/{g.lines.length})</span>
          </h3>
          <ul className="space-y-2">
            {g.lines.map(l => (
              <LineRow
                key={l.id}
                line={l}
                busy={busy === l.id}
                onPick={() => run(l.id, () => pickLine(l.id), `หยิบ "${l.unitName}" แล้ว`)}
                onUnpick={() => run(l.id, () => unpickLine(l.id), `ยกเลิกหยิบ "${l.unitName}" แล้ว`)}
                onSwap={() => setSwapping(l)}
              />
            ))}
          </ul>
        </section>
      ))}

      <div className="sticky bottom-0 z-10 -mx-1 space-y-2 border-t border-zinc-200 bg-white/95 px-1 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-semibold tabular-nums">
            หยิบแล้ว {picked}/{total}
          </span>
          {picked === 0 && (
            <Button variant="ghost" size="sm" className="min-h-11" disabled={busy !== null} onClick={back}>
              <RotateCcw className="mr-1 h-4 w-4" /> กลับไปแก้รายการ
            </Button>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${total ? Math.round((picked / total) * 100) : 0}%` }} />
        </div>
      </div>

      {swapping && <SwapDialog key={swapping.id} line={swapping} detail={detail} extraUnits={extraUnits} onClose={() => setSwapping(null)} />}
      {dialog}
    </div>
  )
}
