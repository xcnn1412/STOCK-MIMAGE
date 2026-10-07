'use client'

// ขั้น "เลือกของ" ของใบจัดของ — ต่อแพ็กเกจ → ต่อข้อกำหนด: ช่องเลือกหน่วยตามจำนวน (ตัวเลือกอุปกรณ์ของข้อกำหนด + ป้ายความว่าง)
// บรรทัด locked (ตู้ที่ทีมขายเลือก) แสดงชื่อ + แบบประกอบ แก้ไม่ได้ · "ของเสริม" เพิ่มหน่วยใดก็ได้ในคลัง (ค้นหาชื่อ)
// บันทึกรายการ = setPackingLines (แทนที่ทั้งชุด) · สร้างใบจัดของ = บันทึกแล้ว startPicking (ขาดข้อไหน server บอก)
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Lock, Plus, Save, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useConfirm } from '../../finance/use-confirm'
import { allowedUnits } from '../../packages/package-logic'
import type { CategoryUnit, UnitKind } from '../../packages/types'
import { setPackingLines, startPicking } from '../actions'
import { lineAvailability, requirementKey } from '../packing-logic'
import type { PackingLineInput, PackingListDetail, ScaffoldRequirement } from '../types'
import { AVAILABILITY_TEXT, NONE, UnitSelect, availabilityText, clashQuestion, unitLabel, type EventSlot } from './unit-select'

type Slot = { unitId: string; variant: string }
type Extra = { unitId: string; kind: UnitKind; name: string; serial: string | null }

const PILL = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium'

/** บรรทัดในใบที่เป็นของข้อกำหนดนี้ */
const ofReq = (r: ScaffoldRequirement) => (l: { package_id: string | null; category_id: string | null }) =>
  requirementKey(l.package_id, l.category_id) === requirementKey(r.packageId, r.categoryId)

/** ช่องเริ่มต้นจากบรรทัดที่บันทึกไว้ + ช่องว่างจนครบจำนวน (ไม่นับช่องที่ล็อก) · ของเสริม = บรรทัดที่ไม่ใช่ของข้อกำหนดใด */
export function initialSelection(detail: PackingListDetail): { slots: Record<string, Slot[]>; extras: Extra[] } {
  const slots: Record<string, Slot[]> = {}
  const known = new Set<string>()
  for (const r of detail.scaffold) {
    const key = requirementKey(r.packageId, r.categoryId)
    known.add(key)
    const locked = detail.lines.filter(l => l.locked && ofReq(r)(l)).length
    const saved = detail.lines.filter(l => !l.locked && ofReq(r)(l)).map(l => ({ unitId: l.unitId, variant: l.variant ?? '' }))
    const free = Math.max(0, r.slots - locked)
    slots[key] = [...saved, ...Array.from({ length: Math.max(0, free - saved.length) }, () => ({ unitId: '', variant: '' }))]
  }
  const extras = detail.lines
    .filter(l => !l.locked && !known.has(requirementKey(l.package_id, l.category_id)))
    .map(l => ({ unitId: l.unitId, kind: l.kind, name: l.unitName, serial: l.serial }))
  return { slots, extras }
}

export default function SelectStep({ detail, extraUnits }: { detail: PackingListDetail; extraUnits: CategoryUnit[] }) {
  const listId = detail.list.id
  const [{ slots, extras }, setSel] = useState(() => initialSelection(detail))
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<'save' | 'start' | null>(null)
  const [query, setQuery] = useState('')
  const { confirm, dialog } = useConfirm()

  const event: EventSlot = { eventId: detail.event.id, eventDate: detail.event.event_date, eventTime: detail.event.event_time, eventEndTime: detail.event.event_end_time }
  const lockedLines = detail.lines.filter(l => l.locked)
  const kindOf = new Map<string, UnitKind>()
  for (const list of Object.values(detail.unitsByCategory)) for (const u of list) kindOf.set(u.id, u.kind)
  for (const u of extraUnits) kindOf.set(u.id, u.kind)
  for (const l of detail.lines) kindOf.set(l.unitId, l.kind)

  const taken = new Set<string>([...lockedLines.map(l => l.unitId), ...Object.values(slots).flat().map(s => s.unitId).filter(Boolean), ...extras.map(e => e.unitId)])

  const need = detail.scaffold.reduce((n, r) => n + r.slots, 0)
  const filled = detail.scaffold.reduce((n, r) => {
    const key = requirementKey(r.packageId, r.categoryId)
    const locked = lockedLines.filter(ofReq(r)).length
    return n + Math.min(r.slots, locked + (slots[key] ?? []).filter(s => s.unitId).length)
  }, 0)

  const setSlot = (key: string, index: number, patch: Partial<Slot>) => {
    setSel(prev => ({ ...prev, slots: { ...prev.slots, [key]: (prev.slots[key] ?? []).map((s, i) => (i === index ? { ...s, ...patch } : s)) } }))
    setDirty(true)
  }

  const pickUnit = async (key: string, index: number, unit: CategoryUnit | null, a: ReturnType<typeof lineAvailability> | null) => {
    if (unit && a) {
      const q = clashQuestion(unit, a)
      if (q && !(await confirm({ ...q, variant: 'warning', confirmLabel: 'เลือกหน่วยนี้' }))) return
    }
    setSlot(key, index, { unitId: unit?.id ?? '' })
  }

  const addExtra = async (u: CategoryUnit) => {
    const a = lineAvailability(u, event, detail.bookings)
    const q = clashQuestion(u, a)
    if (q && !(await confirm({ ...q, variant: 'warning', confirmLabel: 'เพิ่มหน่วยนี้' }))) return
    setSel(prev => ({ ...prev, extras: [...prev.extras, { unitId: u.id, kind: u.kind, name: u.name, serial: u.serial ?? null }] }))
    setDirty(true)
    setQuery('')
  }

  const removeExtra = (unitId: string) => {
    setSel(prev => ({ ...prev, extras: prev.extras.filter(e => e.unitId !== unitId) }))
    setDirty(true)
  }

  const inputs = (): PackingLineInput[] => {
    const out: PackingLineInput[] = []
    for (const r of detail.scaffold) {
      for (const s of slots[requirementKey(r.packageId, r.categoryId)] ?? []) {
        if (!s.unitId) continue
        const kit = kindOf.get(s.unitId) === 'kit'
        out.push({ packageId: r.packageId, categoryId: r.categoryId, requirementId: r.requirementId, itemId: kit ? null : s.unitId, kitId: kit ? s.unitId : null, variant: s.variant || null })
      }
    }
    for (const e of extras) out.push({ itemId: e.kind === 'kit' ? null : e.unitId, kitId: e.kind === 'kit' ? e.unitId : null })
    return out
  }

  const save = async (): Promise<boolean> => {
    const res = await setPackingLines(listId, inputs())
    if ('error' in res) {
      toast.error(res.error)
      return false
    }
    setDirty(false)
    return true
  }

  const onSave = async () => {
    setBusy('save')
    if (await save()) toast.success('บันทึกรายการแล้ว')
    setBusy(null)
  }

  const onStart = async () => {
    setBusy('start')
    if (await save()) {
      const res = await startPicking(listId)
      if ('error' in res) toast.error(res.error)
      else toast.success('สร้างใบจัดของแล้ว — เริ่มหยิบของตามชั้นได้เลย')
    }
    setBusy(null)
  }

  const q = query.trim().toLowerCase()
  const results = q
    ? extraUnits.filter(u => !taken.has(u.id) && (u.name.toLowerCase().includes(q) || (u.serial ?? '').toLowerCase().includes(q))).slice(0, 12)
    : []

  // จัดกลุ่มข้อกำหนดตามแพ็กเกจของงาน (ลำดับเดียวกับที่ทีมขายเลือก)
  const groups: { leadPackageId: string; name: string; quantity: number; reqs: ScaffoldRequirement[] }[] = []
  for (const r of detail.scaffold) {
    let g = groups.find(x => x.leadPackageId === r.leadPackageId)
    if (!g) {
      const lp = detail.leadPackages.find(p => p.id === r.leadPackageId)
      g = { leadPackageId: r.leadPackageId, name: r.packageName, quantity: lp?.quantity ?? 1, reqs: [] }
      groups.push(g)
    }
    g.reqs.push(r)
  }

  return (
    <div className="space-y-5">
      {detail.scaffold.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          งานนี้ยังไม่มีแพ็กเกจ (หรือแพ็กเกจยังไม่ได้ตั้งอุปกรณ์) — ให้ทีมขายเลือกแพ็กเกจก่อน แล้วค่อยกลับมาเลือกของ
        </div>
      )}

      {groups.map(g => (
        <section key={g.leadPackageId} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="font-semibold wrap-break-word">
            {g.name}
            {g.quantity > 1 && <span className="ml-1 text-sm font-normal text-zinc-500">×{g.quantity} ชุด</span>}
          </h3>
          {g.reqs.map(r => {
            const key = requirementKey(r.packageId, r.categoryId)
            const locked = lockedLines.filter(ofReq(r))
            const options = allowedUnits(r, detail.unitsByCategory[r.categoryId] ?? [])
            const chosen = locked.length + (slots[key] ?? []).filter(s => s.unitId).length
            return (
              <div key={key} className="space-y-2 border-t border-zinc-100 pt-3 first:border-0 first:pt-0 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    {r.categoryName} <span className="text-zinc-500">×{r.slots}</span>
                  </div>
                  <span className={cn(PILL, chosen >= r.slots ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100')}>
                    เลือกแล้ว {Math.min(chosen, r.slots)}/{r.slots}
                  </span>
                </div>

                {locked.map(l => {
                  const a = lineAvailability({ id: l.unitId, status: l.unitStatus }, event, detail.bookings)
                  const bad = !a.selectable || a.status === 'out'
                  return (
                    <div key={l.id} className={cn('rounded-lg border p-2.5 text-sm', bad ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40' : 'border-violet-200 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/30')}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                        <span className="font-medium wrap-break-word">{l.unitName}</span>
                        {l.variant && <span className={cn(PILL, 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200')}>{l.variant}</span>}
                        <span className="text-xs text-zinc-500">ทีมขายเลือกไว้</span>
                        <span className={cn('text-xs', AVAILABILITY_TEXT[a.status])}>· {availabilityText(a)}</span>
                      </div>
                      {bad && <div className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">ตู้ที่ขายไว้ใช้ไม่ได้ แจ้งทีมขายเปลี่ยน</div>}
                    </div>
                  )
                })}

                {(slots[key] ?? []).map((s, i) => (
                  <div key={i} className="flex flex-col gap-2 sm:flex-row">
                    <UnitSelect
                      units={options}
                      value={s.unitId}
                      onChange={(u, a) => pickUnit(key, i, u, a)}
                      event={event}
                      bookings={detail.bookings}
                      taken={taken}
                      placeholder={`เลือก${r.categoryName} (ช่องที่ ${locked.length + i + 1})`}
                      className="sm:flex-1"
                    />
                    {r.variants.length > 0 && (
                      <Select value={s.variant || NONE} onValueChange={v => setSlot(key, i, { variant: v === NONE ? '' : v })}>
                        <SelectTrigger className="h-11 w-full text-sm sm:w-40">
                          <SelectValue placeholder="แบบประกอบ" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          <SelectItem value={NONE}>ไม่ระบุแบบ</SelectItem>
                          {r.variants.map(v => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
                {options.length === 0 && locked.length < r.slots && (
                  <p className="text-xs text-red-600 dark:text-red-400">ประเภทนี้ยังไม่มีอุปกรณ์ในตัวเลือก — ให้ผู้ดูแลอุปกรณ์เพิ่มอุปกรณ์เข้าประเภท</p>
                )}
              </div>
            )
          })}
        </section>
      ))}

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h3 className="font-semibold">ของเสริม</h3>
          <p className="text-xs text-muted-foreground">ของที่ไม่อยู่ในแพ็กเกจแต่ต้องเอาไปงานนี้ — เลือกได้ทุกหน่วยในคลัง</p>
        </div>
        {extras.length > 0 && (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {extras.map(e => {
              const a = lineAvailability({ id: e.unitId, status: extraUnits.find(u => u.id === e.unitId)?.status ?? 'available' }, event, detail.bookings)
              return (
                <li key={e.unitId} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="min-w-0 text-sm">
                    <div className="font-medium wrap-break-word">{unitLabel(e)}</div>
                    <div className={cn('text-xs', AVAILABILITY_TEXT[a.status])}>{availabilityText(a)}</div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-red-600" aria-label={`เอา ${e.name} ออก`} onClick={() => removeExtra(e.unitId)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาชื่ออุปกรณ์ / กระเป๋า / serial" className="h-11 pl-9" />
        </div>
        {q && results.length === 0 && <p className="text-sm text-zinc-500">ไม่พบอุปกรณ์ที่ตรงกับ “{query}”</p>}
        {results.length > 0 && (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {results.map(u => {
              const a = lineAvailability(u, event, detail.bookings)
              return (
                <li key={u.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <div className="min-w-0 text-sm">
                    <div className="wrap-break-word">{unitLabel(u)}</div>
                    <div className={cn('text-xs', AVAILABILITY_TEXT[a.status])}>{availabilityText(a)}</div>
                  </div>
                  <Button variant="outline" size="sm" className="min-h-11 shrink-0" disabled={!a.selectable} onClick={() => addExtra(u)}>
                    <Plus className="mr-1 h-4 w-4" /> เพิ่ม
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="sticky bottom-0 z-10 -mx-1 space-y-2 border-t border-zinc-200 bg-white/95 px-1 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium tabular-nums">
            เลือกตามแพ็กเกจแล้ว {filled}/{need}
            {extras.length > 0 && <span className="font-normal text-zinc-500"> · ของเสริม {extras.length}</span>}
          </span>
          {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">ยังไม่บันทึก</span>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="min-h-11" disabled={busy !== null} onClick={onSave}>
            {busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            บันทึกรายการ
          </Button>
          <Button className="min-h-11" disabled={busy !== null || detail.scaffold.length === 0} onClick={onStart}>
            {busy === 'start' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            สร้างใบจัดของ
          </Button>
        </div>
      </div>
      {dialog}
    </div>
  )
}
