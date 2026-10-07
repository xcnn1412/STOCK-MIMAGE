'use client'

// คืนของที่จุดรับของ (ใบ "ออกงาน") — ต่อบรรทัดเลือกสภาพ (ค่าเริ่มต้นใช้ได้ · ปุ่ม "ใช้ได้ทั้งหมด")
// บรรทัดกระเป๋า: กดขยายเลือกสภาพรายชิ้นได้ + ช่อง "ใช้ไป" ของวัสดุสิ้นเปลืองต่อรายการ (parseCount · เกินจำนวนประจำกระเป๋า = เตือนเหลือง ไม่บล็อก)
// รูปตอนคืน (ไม่บังคับ — compressImage → uploadReturnPhoto) + หมายเหตุ · ยืนยัน (useConfirm เมื่อมีของสภาพไม่ใช่ใช้ได้) → returnPackingList
// กติกาสภาพรายชิ้นตรงกับ parseReturnInput: ไม่ระบุชิ้นใดเลย = ทุกชิ้นได้สภาพของกระเป๋า · ระบุบางชิ้น = ชิ้นที่ไม่ระบุถือว่าใช้ได้
import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Camera, CheckCheck, ChevronDown, ChevronUp, Loader2, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { compressImage, cn } from '@/lib/utils'
import { useConfirm } from '../../finance/use-confirm'
import { parseCount } from '../../shelves/consumable-logic'
import { returnPackingList, uploadReturnPhoto } from '../../packing/actions'
import { lineTags } from '../../packing/[id]/pick-step'
import { RETURN_CONDITIONS, RETURN_CONDITION_LABELS } from '../../packing/packing-logic'
import type { KitItemState, PackingLineView, PickupCard, ReturnCondition } from '../../packing/types'

const pairKey = (kitId: string, itemId: string) => `${kitId}:${itemId}`

/** ชิ้นในกระเป๋าที่ออกงานให้อีเวนต์นี้ (เลือกสภาพรายชิ้นได้) — ไม่นับวัสดุสิ้นเปลือง และชิ้นที่ออกงานอยู่กับงานอื่น */
export const returnableKitItems = (line: PackingLineView): KitItemState[] =>
  (line.kitItems ?? []).filter(i => !i.is_consumable && !i.outElsewhere && i.status === 'in_use')

function ConditionSelect({ value, onChange, label }: { value: ReturnCondition; onChange: (v: ReturnCondition) => void; label: string }) {
  return (
    <Select value={value} onValueChange={v => onChange(v as ReturnCondition)}>
      <SelectTrigger
        aria-label={label}
        className={cn('h-11 w-full shrink-0 text-sm sm:w-36', value !== 'available' && 'border-red-300 text-red-700 dark:border-red-800 dark:text-red-300')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {RETURN_CONDITIONS.map(c => (
          <SelectItem key={c} value={c}>
            {RETURN_CONDITION_LABELS[c]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function ReturnSheet({ card, initialOpen = false }: { card: PickupCard; initialOpen?: boolean }) {
  const listId = card.list?.id ?? ''
  const [open, setOpen] = useState(initialOpen)
  const [cond, setCond] = useState<Record<string, ReturnCondition>>({})
  const [itemCond, setItemCond] = useState<Record<string, ReturnCondition>>({})
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [used, setUsed] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const { confirm, dialog } = useConfirm()

  const lineCond = (id: string): ReturnCondition => cond[id] ?? 'available'
  /** สภาพที่จะเกิดจริงของชิ้นในกระเป๋า (ตรงกับ parseReturnInput) */
  const kitItemCond = (line: PackingLineView, itemId: string): ReturnCondition => {
    const anyGiven = returnableKitItems(line).some(i => itemCond[i.id])
    return itemCond[itemId] ?? (anyGiven ? 'available' : lineCond(line.id))
  }

  // วัสดุสิ้นเปลืองที่ยังไม่ตัดยอด (ตัดแล้ว = แสดงเฉยๆ ไม่ส่งซ้ำ)
  const openConsumables = card.consumables.filter(c => c.alreadyUsed == null)
  const usedOf = (kitId: string, itemId: string) => used[pairKey(kitId, itemId)] ?? '0'
  const usageValid = openConsumables.every(c => parseCount(usedOf(c.kitId, c.itemId)) != null)

  // ของที่สภาพไม่ใช่ "ใช้ได้" (ขึ้นในกล่องยืนยัน) — กระเป๋านับรายชิ้น · กระเป๋าที่ไม่มีชิ้นออกงานนับทั้งใบ
  const problems: string[] = []
  for (const l of card.lines) {
    const kitItems = l.kind === 'kit' ? returnableKitItems(l) : []
    if (kitItems.length > 0) {
      for (const i of kitItems) {
        const c = kitItemCond(l, i.id)
        if (c !== 'available') problems.push(`${i.name} (${l.unitName}) — ${RETURN_CONDITION_LABELS[c]}`)
      }
    } else if (lineCond(l.id) !== 'available') {
      problems.push(`${l.unitName} — ${RETURN_CONDITION_LABELS[lineCond(l.id)]}`)
    }
  }

  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allAvailable = () => {
    setCond({})
    setItemCond({})
  }

  const upload = async (files: FileList | null) => {
    const list = Array.from(files ?? []).filter(f => f.type.startsWith('image/'))
    if (list.length === 0) return
    let done = 0
    for (const file of list) {
      setUploading(`กำลังอัปโหลดรูป ${done + 1}/${list.length}`)
      try {
        const fd = new FormData()
        fd.append('listId', listId)
        fd.append('file', await compressImage(file))
        const res = await uploadReturnPhoto(fd)
        if ('error' in res) toast.error(`${file.name}: ${res.error}`)
        else setPhotos(prev => [...prev, res.url])
      } catch (e) {
        console.error('uploadReturnPhoto', e)
        toast.error(`${file.name}: อัปโหลดรูปไม่สำเร็จ`)
      }
      done++
    }
    setUploading(null)
  }

  const submit = async () => {
    if (!usageValid) {
      toast.error('จำนวนวัสดุสิ้นเปลืองที่ใช้ไปต้องเป็นจำนวนเต็มตั้งแต่ 0')
      return
    }
    if (problems.length > 0) {
      const ok = await confirm({
        title: `ยืนยันคืนของ — มีของสภาพไม่ปกติ ${problems.length} รายการ`,
        description: (
          <span className="block space-y-1">
            <span className="block">สถานะของรายการเหล่านี้จะถูกตั้งทันที (ไม่พร้อมใช้จนกว่าจะแก้)</span>
            {problems.map(p => (
              <span key={p} className="block font-medium">
                • {p}
              </span>
            ))}
          </span>
        ),
        variant: 'warning',
        confirmLabel: 'ยืนยันคืนของ',
      })
      if (!ok) return
    }
    setSaving(true)
    const res = await returnPackingList(listId, {
      lines: card.lines.map(l => ({ lineId: l.id, condition: lineCond(l.id) })),
      kitItems: Object.entries(itemCond).map(([itemId, condition]) => ({ itemId, condition })),
      consumableUse: openConsumables.map(c => ({ kitId: c.kitId, itemId: c.itemId, used: parseCount(usedOf(c.kitId, c.itemId)) ?? 0 })),
      photoUrls: photos,
      note: note.trim() || null,
    })
    setSaving(false)
    if ('error' in res) toast.error(res.error)
    else if (res.eventClosed) toast.success('คืนของแล้ว — ปิดอีเวนต์เรียบร้อย รอทีมจัดของคืนชั้น')
    else if (res.closeError) toast.warning(`คืนของแล้ว แต่ปิดอีเวนต์ไม่สำเร็จ: ${res.closeError} — ให้ผู้มีสิทธิ์ปิดงานกดปิดจากหน้าปิดงาน`)
    else toast.success('คืนของแล้ว — รอผู้มีสิทธิ์ปิดงานกดปิดอีเวนต์')
  }

  if (!open) {
    return (
      <Button className="min-h-11 w-full bg-violet-600 text-white hover:bg-violet-700" onClick={() => setOpen(true)}>
        <RotateCcw className="mr-1 h-4 w-4" /> คืนของ ({card.lines.length} รายการ)
        <ChevronDown className="ml-1 h-4 w-4" />
      </Button>
    )
  }

  return (
    <section className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-2 dark:border-violet-900 dark:bg-violet-950/20" data-testid="return-sheet">
      <div className="flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <h4 className="flex items-center gap-1.5 font-semibold">
            <RotateCcw className="h-4 w-4 shrink-0 text-violet-700 dark:text-violet-300" /> คืนของ — ระบุสภาพทุกรายการ
          </h4>
          <p className="text-xs text-muted-foreground">ค่าเริ่มต้น “ใช้ได้” · เปลี่ยนเฉพาะชิ้นที่เสียหาย ต้องซ่อม หรือหาย</p>
        </div>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="ปิดเช็กลิสต์คืนของ" onClick={() => setOpen(false)}>
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>

      <Button variant="outline" className="min-h-11 w-full" disabled={saving} onClick={allAvailable}>
        <CheckCheck className="mr-1 h-4 w-4" /> ใช้ได้ทั้งหมด
      </Button>

      <ul className="space-y-2">
        {card.lines.map(l => {
          const kitItems = l.kind === 'kit' ? returnableKitItems(l) : []
          const consumables = l.kit_id ? card.consumables.filter(c => c.kitId === l.kit_id) : []
          const isOpen = expanded.has(l.id)
          return (
            <li key={l.id} className="space-y-2 rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-medium wrap-break-word">
                    {l.unitName}
                    {l.variant && <span className="ml-1 text-xs font-normal text-violet-700 dark:text-violet-300">({l.variant})</span>}
                  </div>
                  <div className="text-xs text-zinc-500 wrap-break-word">
                    {l.serial && <>S/N {l.serial} · </>}
                    {lineTags(l)}
                  </div>
                </div>
                <ConditionSelect value={lineCond(l.id)} onChange={v => setCond(prev => ({ ...prev, [l.id]: v }))} label={`สภาพของ ${l.unitName}`} />
              </div>

              {kitItems.length > 0 && (
                <div className="space-y-1.5">
                  <Button variant="ghost" size="sm" className="min-h-11 w-full justify-between px-2 text-sm" onClick={() => toggleExpand(l.id)} aria-expanded={isOpen}>
                    <span>ระบุสภาพรายชิ้น ({kitItems.length} ชิ้น)</span>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                  {isOpen && (
                    <>
                      <p className="px-2 text-xs text-muted-foreground">ระบุบางชิ้นแล้ว ชิ้นที่ไม่ได้เปลี่ยนถือว่าใช้ได้ · ไม่ระบุเลย = ทุกชิ้นตามสภาพของกระเป๋า</p>
                      <ul className="space-y-1.5 border-l-2 border-zinc-200 pl-2 dark:border-zinc-800">
                        {kitItems.map(i => (
                          <li key={i.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-sm wrap-break-word">{i.name}</span>
                            <ConditionSelect value={kitItemCond(l, i.id)} onChange={v => setItemCond(prev => ({ ...prev, [i.id]: v }))} label={`สภาพของ ${i.name}`} />
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

              {consumables.length > 0 && (
                <div className="space-y-1.5 rounded-md bg-zinc-50 p-2 dark:bg-zinc-900">
                  <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">วัสดุสิ้นเปลือง — ใช้ไปกี่ชิ้น</div>
                  {consumables.map(c => {
                    const raw = usedOf(c.kitId, c.itemId)
                    const n = parseCount(raw)
                    return (
                      <div key={pairKey(c.kitId, c.itemId)} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 text-sm wrap-break-word">
                            {c.name}
                            <span className="block text-xs text-zinc-500">
                              ประจำกระเป๋า {c.kitQuantity} {c.unit ?? 'ชิ้น'}
                            </span>
                          </span>
                          {c.alreadyUsed != null ? (
                            <span className="shrink-0 text-xs text-zinc-500">
                              ตัดยอดแล้ว {c.alreadyUsed} {c.unit ?? 'ชิ้น'}
                            </span>
                          ) : (
                            <Input
                              type="text"
                              inputMode="numeric"
                              aria-label={`ใช้ไป ${c.name}`}
                              className={cn('h-11 w-24 shrink-0 text-right tabular-nums', n == null && 'border-red-400')}
                              value={raw}
                              onChange={e => setUsed(prev => ({ ...prev, [pairKey(c.kitId, c.itemId)]: e.target.value }))}
                            />
                          )}
                        </div>
                        {c.alreadyUsed == null && n == null && <p className="text-xs text-red-600 dark:text-red-400">กรอกเป็นจำนวนเต็มตั้งแต่ 0</p>}
                        {c.alreadyUsed == null && n != null && n > c.kitQuantity && (
                          <p className="flex items-start gap-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" data-testid="over-kit-quantity">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> ใช้ไปเกินจำนวนประจำกระเป๋า ({c.kitQuantity}) — ตรวจอีกครั้ง (บันทึกได้)
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="space-y-2">
        <div className="text-sm font-medium">รูปตอนคืน (ไม่บังคับ)</div>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map(url => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="รูปตอนคืนของ" className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label="ลบรูปนี้"
                  className="absolute top-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
                  onClick={() => setPhotos(prev => prev.filter(u => u !== url))}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <label
          className={cn(
            'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900',
            uploading && 'pointer-events-none opacity-60',
          )}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {uploading ?? 'ถ่ายรูป / เลือกรูป'}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={!!uploading}
            onChange={e => {
              void upload(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      <div className="space-y-1">
        <label htmlFor={`return-note-${listId}`} className="text-sm font-medium">
          หมายเหตุ (ไม่บังคับ)
        </label>
        <Textarea id={`return-note-${listId}`} value={note} maxLength={500} rows={2} placeholder="เช่น สายไฟขาด 1 เส้น" onChange={e => setNote(e.target.value)} />
      </div>

      {problems.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          มีของสภาพไม่ปกติ {problems.length} รายการ — ระบบจะตั้งสถานะให้ทันทีตอนคืน
        </div>
      )}

      <Button className="min-h-11 w-full bg-violet-600 text-white hover:bg-violet-700" disabled={saving || !!uploading || !usageValid || card.lines.length === 0} onClick={submit}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        ยืนยันคืนของ
      </Button>
      {dialog}
    </section>
  )
}
