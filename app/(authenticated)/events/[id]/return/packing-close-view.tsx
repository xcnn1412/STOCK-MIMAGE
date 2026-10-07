'use client'

// หน้าปิดงานของอีเวนต์ที่มีใบจัดของ (/events/[id]/return) — ไม่ต้องติ๊กซ้ำ ใช้สภาพ/วัสดุสิ้นเปลือง/รูปที่บันทึกตอนคืนของ
// PackingCloseView: ใบคืนแล้ว (หรือคืนชั้นครบแล้วแต่อีเวนต์ยังเปิด) → สรุป + ปุ่ม "ปิดงาน" → closeEventFromPacking → /events
// PackingNotReturned: ใบยังไม่คืนของ → ข้อความ + ลิงก์ใบ (ปิดงานแบบเดิมไม่ได้)
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, Loader2, MapPin, PackageOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '../../../finance/use-confirm'
import { closeEventFromPacking } from '../../../packing/actions'
import { eventWhen } from '../../../packing/format'
import { PACKING_STATUS_LABELS } from '../../../packing/packing-logic'
import { PackingStatusChip } from '../../../packing/status-chip'
import type { PackingListDetail, PackingListRow } from '../../../packing/types'
import { LineSummaryList, PhotoGrid, Timeline } from '../../../packing/[id]/out-summary'

function BackLink() {
  return (
    <Link href="/events" className="shrink-0">
      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="กลับไปหน้าอีเวนต์">
        <ArrowLeft className="h-4 w-4" />
      </Button>
    </Link>
  )
}

export function PackingCloseView({ detail }: { detail: PackingListDetail }) {
  const router = useRouter()
  const { list, event, lead } = detail
  const [closing, setClosing] = useState(false)
  const { confirm, dialog } = useConfirm()
  const problems = detail.lines.filter(l => l.return_condition && l.return_condition !== 'available').length
  const cut = detail.consumables.filter(c => c.alreadyUsed != null && c.alreadyUsed > 0)
  const kitName = new Map(detail.lines.flatMap(l => (l.kit_id ? [[l.kit_id, l.unitName] as const] : [])))

  const close = async () => {
    const ok = await confirm({
      title: 'ปิดงานอีเวนต์นี้?',
      description: 'ใช้สภาพของและวัสดุสิ้นเปลืองที่ทีมหน้างานบันทึกตอนคืนของ — ไม่ต้องติ๊กซ้ำ อีเวนต์จะเป็น "เสร็จสิ้น" และใบงานหน้างานปิดตาม',
      confirmLabel: 'ปิดงาน',
    })
    if (!ok) return
    setClosing(true)
    const res = await closeEventFromPacking(list.id)
    if ('error' in res) {
      setClosing(false)
      toast.error(res.error)
      return
    }
    toast.success('ปิดงานอีเวนต์แล้ว')
    router.push('/events')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-6" data-testid="packing-close-view">
      <div className="flex items-start gap-2">
        <BackLink />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">ปิดงานอีเวนต์ (จากใบจัดของ)</div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight wrap-break-word md:text-2xl">{lead?.customer_name || event.name}</h2>
            <PackingStatusChip status={list.status} />
          </div>
          {lead?.customer_name && <div className="text-sm text-zinc-500 wrap-break-word">{event.name}</div>}
          <div className="flex items-start gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
            {eventWhen(event.event_date, event.event_time, event.event_end_time)}
          </div>
          {(event.location || lead?.event_location) && (
            <div className="flex items-start gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              <span className="wrap-break-word">{event.location || lead?.event_location}</span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
        <div className="flex items-center gap-1.5 font-semibold">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> ทีมหน้างานคืนของแล้ว — ตรวจสรุปแล้วกดปิดงาน
        </div>
        <div className="mt-0.5">
          {detail.lines.length} รายการ{problems > 0 ? ` · มีของเสีย/ซ่อม/หาย ${problems} รายการ` : ' · ใช้ได้ทั้งหมด'}
        </div>
      </div>

      <Timeline detail={detail} />

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">วัสดุสิ้นเปลืองที่ตัดยอดแล้ว</h3>
        {cut.length === 0 ? (
          <p className="text-sm text-muted-foreground">ไม่มีการตัดยอดวัสดุสิ้นเปลือง</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white text-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {cut.map(c => (
              <li key={`${c.kitId}:${c.itemId}`} className="flex items-start justify-between gap-2 px-3 py-2">
                <span className="min-w-0 wrap-break-word">
                  {c.name}
                  <span className="block text-xs text-zinc-500">{kitName.get(c.kitId) ?? 'กระเป๋า'}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  ใช้ไป {c.alreadyUsed} {c.unit ?? 'ชิ้น'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {list.return_note && (
        <div className="rounded-lg bg-zinc-50 p-3 text-sm wrap-break-word dark:bg-zinc-900">
          <span className="font-medium">หมายเหตุตอนคืน:</span> {list.return_note}
        </div>
      )}
      {list.return_photo_urls.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">รูปตอนคืน</h3>
          <PhotoGrid urls={list.return_photo_urls} alt="รูปตอนคืนของ" />
        </section>
      )}

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">รายการและสภาพตอนคืน</h3>
        <LineSummaryList lines={detail.lines} showCondition />
      </section>

      <div className="sticky bottom-0 z-10 -mx-1 border-t border-zinc-200 bg-white/95 px-1 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <Button className="min-h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700" disabled={closing} onClick={close}>
          {closing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
          ปิดงาน
        </Button>
      </div>
      {dialog}
    </div>
  )
}

/** ใบจัดของยังไม่คืนของ — ปิดงานแบบเดิมไม่ได้ ให้คืนของที่จุดรับของก่อน */
export function PackingNotReturned({ list, eventName }: { list: Pick<PackingListRow, 'id' | 'status'>; eventName: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-4" data-testid="packing-not-returned">
      <div className="flex items-start gap-2">
        <BackLink />
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">ปิดงานอีเวนต์</div>
          <h2 className="text-xl font-bold tracking-tight wrap-break-word">{eventName}</h2>
        </div>
      </div>
      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <div className="flex items-start gap-1.5 font-semibold">
          <PackageOpen className="mt-0.5 h-5 w-5 shrink-0" /> ใบจัดของยังไม่คืนของ — ให้ทีมหน้างานคืนของที่จุดรับของก่อน
        </div>
        <p className="text-sm">ใบจัดของของอีเวนต์นี้อยู่ในสถานะ “{PACKING_STATUS_LABELS[list.status] ?? list.status}” — เมื่อคืนของแล้วจะกลับมาปิดงานที่หน้านี้ได้โดยไม่ต้องติ๊กซ้ำ</p>
      </div>
      <Link href={`/packing/${list.id}`} className="block">
        <Button variant="outline" className="min-h-11 w-full">
          <ClipboardList className="mr-1 h-4 w-4" /> เปิดใบจัดของ
        </Button>
      </Link>
    </div>
  )
}
