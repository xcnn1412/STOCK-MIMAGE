'use client'

// หัวข้อ "จุดรับของ" ในตั้งค่าคลัง — เพิ่ม/แก้/ปิดใช้/ลบ (useConfirm) ชื่อ + รหัส + หมายเหตุ · พิมพ์ QR ของทุกจุด (/stock/settings/pickup-print)
// จุดรับของ = ตำแหน่งในออฟฟิศที่วางของที่จัดเสร็จ มี QR ของตัวเอง (สแกนเพื่อรับของ/คืนของ)
import { useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, MapPinned, Pencil, Plus, Printer, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useConfirm } from '../../finance/use-confirm'
import { MAX_SPOT_CODE, MAX_SPOT_NAME } from '../../packing/packing-logic'
import type { PickupSpot } from '../../packing/types'
import { createPickupSpot, deletePickupSpot, updatePickupSpot } from './actions'

const PILL = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium'

/** กล่องเพิ่ม/แก้จุดรับของ — spot = null คือเพิ่มใหม่ */
export function PickupSpotDialog({ spot, onClose }: { spot: PickupSpot | null; onClose: () => void }) {
  const [name, setName] = useState(spot?.name ?? '')
  const [code, setCode] = useState(spot?.code ?? '')
  const [note, setNote] = useState(spot?.note ?? '')
  const [active, setActive] = useState(spot?.is_active ?? true)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const input = { name, code, note, is_active: active }
    const res = spot ? await updatePickupSpot(spot.id, input) : await createPickupSpot(input)
    setSaving(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success(spot ? `บันทึกจุด "${name.trim()}" แล้ว` : `เพิ่มจุด "${name.trim()}" แล้ว`)
    onClose()
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[85vh] w-[95vw] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{spot ? 'แก้ไขจุดรับของ' : 'เพิ่มจุดรับของ'}</DialogTitle>
          <DialogDescription>ตำแหน่งในออฟฟิศที่วางของที่จัดเสร็จ รอทีมหน้างานมารับ เช่น หน้าห้องเก็บของ โต๊ะหน้าประตู</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="spot-name">ชื่อจุด</Label>
            <Input id="spot-name" value={name} onChange={e => setName(e.target.value)} maxLength={MAX_SPOT_NAME} required autoFocus placeholder="เช่น หน้าห้องเก็บของ" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="spot-code">รหัส</Label>
            <Input id="spot-code" value={code} onChange={e => setCode(e.target.value)} maxLength={MAX_SPOT_CODE} required placeholder="เช่น P1" />
            <p className="text-xs text-muted-foreground">รหัสสั้นๆ ที่พิมพ์บนป้าย QR (ห้ามซ้ำกับจุดอื่น)</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="spot-note">หมายเหตุ (ถ้ามี)</Label>
            <Textarea id="spot-note" value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={200} placeholder="เช่น ชั้นวางสีเขียวข้างประตู" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="spot-active" checked={active} onCheckedChange={v => setActive(v === true)} />
            <Label htmlFor="spot-active">เปิดใช้</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" className="min-h-11" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              บันทึก
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function PickupSpotsSection({ spots }: { spots: PickupSpot[] }) {
  // undefined = ปิดกล่อง · null = เพิ่มใหม่
  const [editing, setEditing] = useState<PickupSpot | null | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const { confirm: ask, dialog } = useConfirm()

  const toggle = async (s: PickupSpot) => {
    setBusy(s.id)
    const res = await updatePickupSpot(s.id, { name: s.name, code: s.code, note: s.note, is_active: !s.is_active })
    setBusy(null)
    if ('error' in res) toast.error(res.error)
    else toast.success(s.is_active ? `ปิดใช้จุด "${s.name}" แล้ว` : `เปิดใช้จุด "${s.name}" แล้ว`)
  }

  const remove = async (s: PickupSpot) => {
    const ok = await ask({
      title: `ลบจุดรับของ "${s.name}"?`,
      description: 'ลบได้เฉพาะจุดที่ไม่เคยมีใบจัดของวางไว้ — ถ้าเคยใช้แล้วให้ปิดใช้แทน',
      variant: 'destructive',
      confirmLabel: 'ลบ',
    })
    if (!ok) return
    setBusy(s.id)
    const res = await deletePickupSpot(s.id)
    setBusy(null)
    if ('error' in res) toast.error(res.error)
    else toast.success(`ลบจุด "${s.name}" แล้ว`)
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <MapPinned className="h-5 w-5 text-zinc-500" /> จุดรับของ
          </h3>
          <p className="text-sm text-muted-foreground">ที่วางของที่จัดเสร็จ — ติด QR ไว้ที่จุด ทีมหน้างานสแกนเพื่อรับของ / คืนของ</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/stock/settings/pickup-print">
            <Button variant="outline">
              <Printer className="mr-1 h-4 w-4" /> พิมพ์ QR จุดรับของ
            </Button>
          </Link>
          <Button onClick={() => setEditing(null)}>
            <Plus className="mr-1 h-4 w-4" /> เพิ่มจุดรับของ
          </Button>
        </div>
      </div>

      {spots.length === 0 && (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">ยังไม่มีจุดรับของ — กด “เพิ่มจุดรับของ” เพื่อเริ่ม</div>
      )}

      <div className="space-y-2">
        {spots.map(s => (
          <Card key={s.id} className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center', !s.is_active && 'opacity-60')}>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold wrap-break-word">{s.name}</span>
                <span className={cn(PILL, 'bg-zinc-100 font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300')}>{s.code}</span>
                {!s.is_active && <span className={cn(PILL, 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300')}>ปิดใช้</span>}
              </div>
              {s.note && <div className="text-xs text-muted-foreground wrap-break-word">{s.note}</div>}
              <Link href={`/pickup/${s.id}`} className="text-xs text-violet-600 hover:underline dark:text-violet-400">
                ดูของที่จุดนี้
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="ghost" size="icon" aria-label={s.is_active ? 'ปิดใช้' : 'เปิดใช้'} title={s.is_active ? 'ปิดใช้' : 'เปิดใช้'} disabled={busy === s.id} onClick={() => toggle(s)}>
                {s.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" aria-label="แก้ไข" title="แก้ไข" onClick={() => setEditing(s)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="ลบ" title="ลบ" className="text-red-600 hover:text-red-700" disabled={busy === s.id} onClick={() => remove(s)}>
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {editing !== undefined && <PickupSpotDialog key={editing?.id ?? 'new'} spot={editing} onClose={() => setEditing(undefined)} />}
      {dialog}
    </section>
  )
}
