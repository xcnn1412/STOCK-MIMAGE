'use client'

// ช่อง "แพ็กเกจ" ของงาน — ตัวเดียวใช้ทั้งตารางภาพรวม /jobs/tracking (ในเซลล์/การ์ดมือถือ) และการ์ดลูกค้า /crm/[id]
// แสดงชิปแพ็กเกจที่เลือก + ชิ้นที่ทีมขายเลือก + ป้ายอุปกรณ์อาจไม่พอ · canEdit = เปิดกล่องเลือกแพ็กเกจ/จำนวนชุด/ชิ้น/แบบประกอบ
// บันทึกด้วย setLeadPackages ของตัวเอง (ไม่ผ่านฟอร์มการ์ด CRM) — action revalidatePath แล้ว ไม่ต้อง router.refresh()

import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Minus, Package as PackageIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/app/(authenticated)/finance/use-confirm'
import { setLeadPackages } from '@/app/(authenticated)/packages/actions'
import { AVAILABILITY_LABELS, MAX_LEAD_PACKAGE_QTY, allowedUnits, capacitySummary, unitAvailability } from './package-logic'
import type {
  CapacityWarning,
  CategoryUnits,
  LeadPackageRow,
  PickerPackage,
  PickerRequirement,
  UnitAvailability,
  UnitBooking,
} from './types'

export interface PackagePickerProps {
  leadId: string
  /** วัน/เวลางาน — ใช้ทำป้ายความว่างของชิ้น (ว่าง/ต่อคิว/ชน) */
  event: { date: string | null; time?: string | null; endTime?: string | null }
  /** แพ็กเกจที่งานเลือกไว้ (เรียงตามลำดับที่เลือก) */
  value: LeadPackageRow[]
  /** แพ็กเกจที่เลือกได้ — เปิดใช้ + ที่งานเลือกไว้แม้ปิดใช้ */
  packages: PickerPackage[]
  /** หน่วยของประเภทที่ทีมขายเลือกชิ้นเอง (categoryId → หน่วย) */
  categoryUnits: CategoryUnits
  /** ชิ้นที่งานอื่นเลือกไว้แล้ว — ป้ายความว่าง */
  unitBookings?: UnitBooking[]
  /** คำเตือนอุปกรณ์อาจไม่พอที่ server คิดไว้ */
  warnings?: CapacityWarning[]
  canEdit: boolean
  /** หลังบันทึกสำเร็จ — หน้า lead ใช้ปรับราคาเสนอในฟอร์มการ์ดการเงิน */
  onSaved?: (result: { quotedPrice: number | null; packageName: string | null }) => void
  /** ชื่อแพ็กเกจเดิมของงาน (crm_leads.package_name ที่แปลงเป็นป้ายแล้ว) — แสดงเมื่อยังไม่เลือกแพ็กเกจจากตารางใหม่ */
  legacyName?: string | null
  className?: string
}

/** ช่องเลือกชิ้นหนึ่งช่อง (ต่อข้อกำหนดประเภทที่ทีมขายเลือกชิ้นเอง × จำนวนที่ต้องใช้) */
type Slot = { unitId: string; variant: string }
type DraftPick = { packageId: string; quantity: number; slots: Record<string, Slot[]> }

const NONE = '__none'
const AVAIL_ORDER: Record<UnitAvailability, number> = { free: 0, queued: 1, clash: 2, unavailable: 3 }
const AVAIL_TEXT: Record<UnitAvailability, string> = {
  free: 'text-emerald-700 dark:text-emerald-400',
  queued: 'text-amber-700 dark:text-amber-400',
  clash: 'text-red-700 dark:text-red-400',
  unavailable: 'text-zinc-400',
}

const salesReqs = (pkg: PickerPackage | undefined) => (pkg?.requirements ?? []).filter(r => r.salesPick)

/** ปรับจำนวนช่องให้เท่า จำนวนต่อชุด × จำนวนชุด (เก็บค่าที่เลือกไว้เท่าที่ยังพอดี) */
function sizeSlots(pkg: PickerPackage | undefined, quantity: number, slots: Record<string, Slot[]>): Record<string, Slot[]> {
  const out: Record<string, Slot[]> = {}
  for (const r of salesReqs(pkg)) {
    const n = r.quantity * quantity
    const cur = slots[r.id] ?? []
    out[r.id] = Array.from({ length: n }, (_, i) => cur[i] ?? { unitId: '', variant: '' })
  }
  return out
}

function draftFrom(value: LeadPackageRow[], byId: Map<string, PickerPackage>): DraftPick[] {
  return value.map(lp => {
    const slots: Record<string, Slot[]> = {}
    for (const u of lp.units) (slots[u.requirementId] ??= []).push({ unitId: u.unitId, variant: u.variant ?? '' })
    return { packageId: lp.packageId, quantity: lp.quantity, slots: sizeSlots(byId.get(lp.packageId), lp.quantity, slots) }
  })
}

/** กล่องคำเตือนเหลือง/แดง (ใช้ทั้งใต้ชิปและในกล่องเลือก) */
function WarningList({ warnings, compact }: { warnings: CapacityWarning[]; compact?: boolean }) {
  const summary = capacitySummary(warnings)
  if (!summary) return null
  const red = summary.level === 'red'
  return (
    <div
      className={cn(
        'rounded-md border px-2 py-1 text-[11px] leading-snug',
        red
          ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
          : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
      )}
      title={compact ? warnings.map(w => w.message).join('\n') : undefined}
    >
      <div className="flex items-center gap-1 font-semibold">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {summary.text}
      </div>
      {!compact && (
        <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
          {warnings.map((w, i) => (
            <li key={`${w.categoryId}:${w.unitId ?? ''}:${i}`}>{w.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function PackagePicker({
  leadId,
  event,
  value,
  packages,
  categoryUnits,
  unitBookings = [],
  warnings = [],
  canEdit,
  onSaved,
  legacyName,
  className,
}: PackagePickerProps) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DraftPick[]>([])
  const [saving, setSaving] = useState(false)
  /** คำเตือนจากการบันทึกล่าสุด — ใช้แทน prop จนกว่า server ส่งรอบใหม่มา */
  const [saved, setSaved] = useState<{ base: CapacityWarning[]; warnings: CapacityWarning[] } | null>(null)
  const shownWarnings = saved && saved.base === warnings ? saved.warnings : warnings

  const byId = new Map(packages.map(p => [p.id, p]))
  const target = { leadId, eventDate: event.date, eventTime: event.time, eventEndTime: event.endTime }

  /** หน่วยที่เลือกได้ของข้อกำหนดหนึ่ง พร้อมป้ายความว่าง เรียง ว่าง → ต่อคิว → ชน → ไม่พร้อม */
  const candidates = (req: PickerRequirement) =>
    allowedUnits(req, categoryUnits[req.categoryId] ?? [])
      .map(u => ({ unit: u, ...unitAvailability(u, target, unitBookings) }))
      .sort((a, b) => AVAIL_ORDER[a.status] - AVAIL_ORDER[b.status] || a.unit.name.localeCompare(b.unit.name, 'th'))

  /** ช่องที่ยังว่าง: ถ้าเหลือชิ้นที่ "ว่าง" และยังไม่ถูกเลือกในงานนี้เพียงชิ้นเดียว เลือกให้เลย */
  const autofill = (picks: DraftPick[]): DraftPick[] => {
    const taken = new Set(picks.flatMap(p => Object.values(p.slots).flat().map(s => s.unitId).filter(Boolean)))
    return picks.map(p => {
      const slots = { ...p.slots }
      for (const r of salesReqs(byId.get(p.packageId))) {
        slots[r.id] = (slots[r.id] ?? []).map(s => {
          if (s.unitId) return s
          const free = candidates(r).filter(c => c.status === 'free' && !taken.has(c.unit.id))
          if (free.length !== 1) return s
          taken.add(free[0].unit.id)
          return { ...s, unitId: free[0].unit.id }
        })
      }
      return { ...p, slots }
    })
  }

  const openEditor = () => {
    setDraft(draftFrom(value, byId))
    setOpen(true)
  }

  const addPackage = (packageId: string) => {
    const pkg = byId.get(packageId)
    if (!pkg) return
    setDraft(d => autofill([...d, { packageId, quantity: 1, slots: sizeSlots(pkg, 1, {}) }]))
  }
  const setQuantity = (index: number, quantity: number) => {
    const q = Math.min(MAX_LEAD_PACKAGE_QTY, Math.max(1, quantity))
    setDraft(d => autofill(d.map((p, i) => (i === index ? { ...p, quantity: q, slots: sizeSlots(byId.get(p.packageId), q, p.slots) } : p))))
  }
  const removePackage = (index: number) => setDraft(d => d.filter((_, i) => i !== index))
  const setSlot = (index: number, reqId: string, slot: number, patch: Partial<Slot>) =>
    setDraft(d =>
      d.map((p, i) =>
        i !== index ? p : { ...p, slots: { ...p.slots, [reqId]: (p.slots[reqId] ?? []).map((s, k) => (k === slot ? { ...s, ...patch } : s)) } },
      ),
    )

  const save = async () => {
    // ชิ้นที่ชนกับงานอื่น — เลือกได้ (นโยบายเตือนไม่บล็อก) แต่ถามยืนยันก่อน
    const clashes: string[] = []
    for (const p of draft) {
      for (const r of salesReqs(byId.get(p.packageId))) {
        for (const s of p.slots[r.id] ?? []) {
          const c = s.unitId ? candidates(r).find(x => x.unit.id === s.unitId) : null
          if (c?.status === 'clash') clashes.push(`${c.unit.name} — ชนกับ ${c.leadNames.join(', ')}`)
        }
      }
    }
    if (clashes.length) {
      const ok = await confirm({
        title: 'มีชิ้นที่ชนกับงานอื่นเวลาเดียวกัน',
        description: <span className="whitespace-pre-line">{`${clashes.join('\n')}\n\nบันทึกได้ แต่ไม่แนะนำ — ยืนยันบันทึกหรือไม่?`}</span>,
        variant: 'warning',
        confirmLabel: 'บันทึก',
      })
      if (!ok) return
    }

    setSaving(true)
    const result = await setLeadPackages(
      leadId,
      draft.map(p => {
        const pkg = byId.get(p.packageId)
        return {
          packageId: p.packageId,
          quantity: p.quantity,
          units: salesReqs(pkg).flatMap(r =>
            (p.slots[r.id] ?? [])
              .filter(s => s.unitId)
              .map(s => {
                const unit = (categoryUnits[r.categoryId] ?? []).find(u => u.id === s.unitId)
                return {
                  requirementId: r.id,
                  itemId: unit?.kind === 'item' ? s.unitId : null,
                  kitId: unit?.kind === 'kit' ? s.unitId : null,
                  variant: s.variant || null,
                }
              }),
          ),
        }
      }),
    )
    setSaving(false)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    setSaved({ base: warnings, warnings: result.warnings })
    onSaved?.({ quotedPrice: result.quotedPrice, packageName: result.packageName })
    if (result.warnings.length) {
      toast.warning('บันทึกแพ็กเกจแล้ว — อุปกรณ์อาจไม่พอ ดูรายละเอียดในกล่อง')
    } else {
      toast.success('บันทึกแพ็กเกจแล้ว')
      setOpen(false)
    }
  }

  const addable = packages.filter(p => p.is_active && !draft.some(d => d.packageId === p.id))

  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      {value.length === 0 ? (
        legacyName ? (
          <p className="text-sm text-zinc-900 dark:text-zinc-100">
            {legacyName}
            <span className="ml-1 text-[11px] text-zinc-400">(ชื่อเดิม ยังไม่ได้เลือกแพ็กเกจ)</span>
          </p>
        ) : (
          <p className="text-xs italic text-zinc-400">ยังไม่เลือกแพ็กเกจ</p>
        )
      ) : (
        <ul className="space-y-1">
          {value.map(lp => {
            const missing = salesReqs(byId.get(lp.packageId))
              .map(r => ({ r, n: r.quantity * lp.quantity - lp.units.filter(u => u.requirementId === r.id).length }))
              .filter(x => x.n > 0)
            return (
              <li key={lp.id} className="min-w-0">
                <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
                  <PackageIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{lp.packageName}</span>
                  {lp.quantity > 1 && <span className="shrink-0 tabular-nums">×{lp.quantity}</span>}
                  {!lp.isActive && <span className="shrink-0 text-[10px] font-normal text-zinc-500">(ปิดใช้)</span>}
                </span>
                {lp.units.length > 0 && (
                  <div className="mt-0.5 pl-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                    {lp.units.map(u => `${u.unitName}${u.variant ? ` (${u.variant})` : ''}`).join(' · ')}
                  </div>
                )}
                {missing.length > 0 && (
                  <div className="pl-2 text-[11px] text-amber-700 dark:text-amber-400">
                    ยังไม่เลือก {missing.map(x => `${x.r.categoryName} ${x.n}`).join(', ')}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <WarningList warnings={shownWarnings} compact />

      {canEdit && (
        <button
          type="button"
          onClick={openEditor}
          className="inline-flex min-h-8 items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          <Pencil className="h-3 w-3" />
          {value.length === 0 ? 'เลือกแพ็กเกจ' : 'แก้แพ็กเกจ'}
        </button>
      )}

      {canEdit && (
        <Dialog open={open} onOpenChange={o => !saving && setOpen(o)}>
          <DialogContent className="max-h-[85vh] w-[95vw] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>แพ็กเกจของงาน</DialogTitle>
              <DialogDescription>เลือกได้หลายแพ็กเกจพร้อมจำนวนชุด · ประเภทที่ทีมขายเลือกชิ้นเอง (ตู้) เลือกชิ้นและแบบประกอบได้ที่นี่</DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {draft.length === 0 && <p className="text-sm text-zinc-500">ยังไม่มีแพ็กเกจ — เพิ่มจากช่องด้านล่าง</p>}
              {draft.map((p, index) => {
                const pkg = byId.get(p.packageId)
                const chosenHere = new Set(draft.flatMap(d => Object.values(d.slots).flat().map(s => s.unitId).filter(Boolean)))
                return (
                  <div key={p.packageId} className="space-y-2 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 text-sm font-medium">
                        {pkg?.name ?? 'แพ็กเกจที่ถูกลบ'}
                        {pkg && !pkg.is_active && <span className="ml-1 text-xs font-normal text-zinc-500">(ปิดใช้)</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="ลดจำนวนชุด" disabled={p.quantity <= 1} onClick={() => setQuantity(index, p.quantity - 1)}>
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="w-14 text-center text-sm tabular-nums">{p.quantity} ชุด</span>
                        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="เพิ่มจำนวนชุด" disabled={p.quantity >= MAX_LEAD_PACKAGE_QTY} onClick={() => setQuantity(index, p.quantity + 1)}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600" aria-label="เอาแพ็กเกจออก" onClick={() => removePackage(index)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {salesReqs(pkg).map(r => {
                      const list = candidates(r)
                      return (
                        <div key={r.id} className="space-y-1.5 rounded-md bg-zinc-50 p-2 dark:bg-zinc-900/50">
                          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                            {r.categoryName} — ทีมขายเลือกชิ้นเอง ({r.quantity * p.quantity} ชิ้น)
                          </div>
                          {list.length === 0 && <p className="text-xs text-zinc-500">ยังไม่มีชิ้นในประเภทนี้ — เพิ่มอุปกรณ์ในประเภทที่ตั้งค่าคลังก่อน</p>}
                          {list.length > 0 &&
                            (p.slots[r.id] ?? []).map((s, k) => (
                              <div key={k} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_auto]">
                                <Select value={s.unitId || NONE} onValueChange={v => setSlot(index, r.id, k, { unitId: v === NONE ? '' : v })}>
                                  <SelectTrigger className="h-9 w-full min-w-0 text-sm">
                                    <SelectValue placeholder={`เลือก${r.categoryName}`} />
                                  </SelectTrigger>
                                  <SelectContent position="popper" className="max-h-72">
                                    <SelectItem value={NONE}>ยังไม่เลือก</SelectItem>
                                    {list.map(c => (
                                      <SelectItem
                                        key={c.unit.id}
                                        value={c.unit.id}
                                        disabled={c.status === 'unavailable' || (chosenHere.has(c.unit.id) && c.unit.id !== s.unitId)}
                                      >
                                        <span>{c.unit.name}</span>
                                        <span className={cn('ml-1 text-xs', AVAIL_TEXT[c.status])}>
                                          · {AVAILABILITY_LABELS[c.status]}
                                          {c.leadNames.length > 0 && ` (${c.leadNames.join(', ')})`}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {r.variants.length > 0 && (
                                  <Select value={s.variant || NONE} onValueChange={v => setSlot(index, r.id, k, { variant: v === NONE ? '' : v })}>
                                    <SelectTrigger className="h-9 w-full text-sm sm:w-36">
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
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {addable.length > 0 && (
                <Select value="" onValueChange={addPackage}>
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue placeholder="+ เพิ่มแพ็กเกจ" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-72">
                    {addable.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.price !== null && ` — ฿${p.price.toLocaleString()}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {packages.length === 0 && <p className="text-xs text-zinc-500">ยังไม่มีแพ็กเกจ — ตั้งได้ที่ คลังอุปกรณ์ → แพ็กเกจ</p>}

              <WarningList warnings={shownWarnings} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                ปิด
              </Button>
              <Button type="button" onClick={save} disabled={saving}>
                {saving ? 'กำลังบันทึก…' : 'บันทึก'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {confirmDialog}
    </div>
  )
}
