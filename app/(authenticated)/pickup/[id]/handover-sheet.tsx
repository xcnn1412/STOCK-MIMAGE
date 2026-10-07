'use client'

// รับของที่จุดรับของ (ใบ "พร้อมรับ") — กดเปิดเช็กลิสต์ ติ๊กทุกบรรทัดขณะขึ้นรถ (หรือ "ครบทุกชิ้น") แล้ว "ยืนยันรับของ"
// ปุ่มยืนยันกดได้เมื่อติ๊กครบ → handOverPackingList(listId, { lineIds }) — server ตรวจครบซ้ำ · ใบเป็น "ออกงาน" และใบงานหน้างานขยับเป็นขนของ
// action revalidatePath หน้าจุดนี้อยู่แล้ว ไม่ต้อง router.refresh()
import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCheck, CheckSquare, ChevronDown, ChevronUp, Loader2, Square, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { handOverPackingList } from '../../packing/actions'
import { lineTags } from '../../packing/[id]/pick-step'
import type { PickupCard } from '../../packing/types'

export default function HandoverSheet({ card, initialOpen = false }: { card: PickupCard; initialOpen?: boolean }) {
  const listId = card.list?.id ?? ''
  const [open, setOpen] = useState(initialOpen)
  const [ticked, setTicked] = useState<Set<string>>(() => new Set())
  const [saving, setSaving] = useState(false)
  const total = card.lines.length
  const count = card.lines.filter(l => ticked.has(l.id)).length
  const complete = total > 0 && count === total

  const toggle = (id: string) =>
    setTicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const submit = async () => {
    setSaving(true)
    const res = await handOverPackingList(listId, { lineIds: card.lines.map(l => l.id).filter(id => ticked.has(id)) })
    setSaving(false)
    if ('error' in res) toast.error(res.error)
    else toast.success('รับของแล้ว — ใบงานหน้างานขยับเป็น "ขนของ" ให้เอง')
  }

  if (!open) {
    return (
      <Button className="min-h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setOpen(true)}>
        <Truck className="mr-1 h-4 w-4" /> รับของ ({total} รายการ)
        <ChevronDown className="ml-1 h-4 w-4" />
      </Button>
    )
  }

  return (
    <section className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2 dark:border-emerald-900 dark:bg-emerald-950/20" data-testid="handover-sheet">
      <div className="flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <h4 className="flex items-center gap-1.5 font-semibold">
            <Truck className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" /> รับของ — ติ๊กทุกชิ้นขณะขึ้นรถ
          </h4>
          <p className="text-xs text-muted-foreground">ติ๊กแล้ว {count}/{total}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="ปิดเช็กลิสต์" onClick={() => setOpen(false)}>
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>

      {total === 0 ? (
        <div className="rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">ใบนี้ยังไม่มีของ</div>
      ) : (
        <ul className="space-y-1.5">
          {card.lines.map(l => {
            const on = ticked.has(l.id)
            return (
              <li key={l.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(l.id)}
                  className={cn(
                    'flex min-h-11 w-full items-start gap-3 rounded-lg border px-3 py-2 text-left',
                    on ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950',
                  )}
                >
                  {on ? <CheckSquare className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" /> : <Square className="mt-0.5 h-6 w-6 shrink-0 text-zinc-400" />}
                  <span className="min-w-0">
                    <span className="block font-medium wrap-break-word">
                      {l.unitName}
                      {l.variant && <span className="ml-1 text-xs font-normal text-violet-700 dark:text-violet-300">({l.variant})</span>}
                    </span>
                    <span className="block text-xs text-zinc-500 wrap-break-word">
                      {l.serial && <>S/N {l.serial} · </>}
                      {lineTags(l)}
                    </span>
                    {l.kind === 'kit' && l.kitItems && l.kitItems.length > 0 && (
                      <span className="block text-xs text-zinc-500">ของในกระเป๋า {l.kitItems.filter(i => !i.is_consumable).length} ชิ้น</span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="min-h-11 sm:flex-1" disabled={total === 0 || complete || saving} onClick={() => setTicked(new Set(card.lines.map(l => l.id)))}>
          <CheckCheck className="mr-1 h-4 w-4" /> ครบทุกชิ้น
        </Button>
        <Button className="min-h-11 bg-emerald-600 text-white hover:bg-emerald-700 sm:flex-1" disabled={!complete || saving} onClick={submit}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          ยืนยันรับของ
        </Button>
      </div>
    </section>
  )
}
