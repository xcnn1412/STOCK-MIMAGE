'use client'

// ส่วน "ยืนยันจัดของ" (ท้ายขั้นกำลังหยิบ): ถ่ายรูปชุดที่จัดเสร็จ ≥ 1 รูป (บีบด้วย compressImage แล้ว uploadPackingPhoto)
// ลบรูปได้ก่อนยืนยัน · เลือกจุดรับของ (เปิดใช้) · ปุ่ม "ยืนยันจัดของ" กดได้เมื่อหยิบครบ + มีรูป + มีจุด → confirmPacking
import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Camera, CheckCircle2, Circle, Loader2, MapPinned, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { compressImage, cn } from '@/lib/utils'
import { confirmPacking, uploadPackingPhoto } from '../actions'
import type { PackingListDetail, PickupSpot } from '../types'

/** ข้อที่ต้องครบก่อนยืนยัน (ตรงกับ canConfirmReady ฝั่ง server) */
export function confirmChecklist(picked: number, total: number, photos: number, spotId: string) {
  return [
    { ok: total > 0 && picked === total, text: total > 0 ? `หยิบครบทุกบรรทัด (${picked}/${total})` : 'ใบนี้ยังไม่มีของ' },
    { ok: photos > 0, text: photos > 0 ? `ถ่ายรูปแล้ว ${photos} รูป` : 'ถ่ายรูปชุดที่จัดเสร็จอย่างน้อย 1 รูป' },
    { ok: !!spotId, text: spotId ? 'เลือกจุดรับของแล้ว' : 'เลือกจุดรับของที่วางของไว้' },
  ]
}

export default function ConfirmStep({ detail, spots }: { detail: PackingListDetail; spots: PickupSpot[] }) {
  const listId = detail.list.id
  // รูปเดิมของใบ (ถอยกลับจากพร้อมรับ) ยังใช้ต่อได้
  const [photos, setPhotos] = useState<string[]>(detail.list.photo_urls)
  const [spotId, setSpotId] = useState(() => {
    const current = detail.list.spot_id && spots.some(s => s.id === detail.list.spot_id) ? detail.list.spot_id : ''
    return current || (spots.length === 1 ? spots[0].id : '')
  })
  const [uploading, setUploading] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const picked = detail.lines.filter(l => l.picked_at).length
  const total = detail.lines.length
  const checklist = confirmChecklist(picked, total, photos.length, spotId)
  const ready = checklist.every(c => c.ok)

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
        const res = await uploadPackingPhoto(fd)
        if ('error' in res) toast.error(`${file.name}: ${res.error}`)
        else setPhotos(prev => [...prev, res.url])
      } catch (e) {
        console.error('uploadPackingPhoto', e)
        toast.error(`${file.name}: อัปโหลดรูปไม่สำเร็จ`)
      }
      done++
    }
    setUploading(null)
  }

  const submit = async () => {
    setSaving(true)
    const res = await confirmPacking(listId, { photoUrls: photos, spotId })
    setSaving(false)
    if ('error' in res) toast.error(res.error)
    else toast.success('ยืนยันจัดของแล้ว — แจ้งหัวหน้างานให้มารับของ')
  }

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h3 className="font-semibold">ยืนยันจัดของ</h3>
        <p className="text-xs text-muted-foreground">หยิบครบแล้ว ถ่ายรูปชุดที่จัดเสร็จ แล้วบอกว่าวางไว้ที่จุดรับของไหน</p>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">รูปชุดที่จัดเสร็จ</div>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map(url => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="รูปชุดที่จัดเสร็จ" className="h-full w-full object-cover" />
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

      <div className="space-y-2">
        <div className="text-sm font-medium">จุดรับของ</div>
        {spots.length === 0 ? (
          <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            ยังไม่มีจุดรับของที่เปิดใช้ — ให้ผู้ดูแลอุปกรณ์เพิ่มที่{' '}
            <Link href="/stock/settings" className="underline">
              ตั้งค่าคลัง
            </Link>
          </p>
        ) : (
          <Select value={spotId} onValueChange={setSpotId}>
            <SelectTrigger className="h-11 w-full text-sm">
              <SelectValue placeholder="เลือกจุดที่วางของไว้" />
            </SelectTrigger>
            <SelectContent position="popper">
              {spots.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <ul className="space-y-1 text-sm">
        {checklist.map(c => (
          <li key={c.text} className={cn('flex items-center gap-1.5', c.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-500')}>
            {c.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Circle className="h-4 w-4 shrink-0" />}
            {c.text}
          </li>
        ))}
      </ul>

      <Button className="min-h-11 w-full" disabled={!ready || saving || !!uploading} onClick={submit}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPinned className="mr-1 h-4 w-4" />}
        ยืนยันจัดของ
      </Button>
    </section>
  )
}
