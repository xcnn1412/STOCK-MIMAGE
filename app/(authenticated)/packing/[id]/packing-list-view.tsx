'use client'

// หน้าใบจัดของ /packing/[id] — หัวงาน + ขั้นตอน 3 ขั้นของเฟสนี้ (เลือกของ → กำลังหยิบ → พร้อมรับ)
// เลือกของ = SelectStep · กำลังหยิบ = PickStep + ConfirmStep · พร้อมรับขึ้นไป = สรุป (+ ปุ่มแก้ไข ถอยเป็นกำลังหยิบ ก่อนรับของ)
// ยกเลิกใบได้เฉพาะ เลือกของ/กำลังหยิบ (useConfirm) · action revalidatePath หน้านี้อยู่แล้ว ไม่ต้อง router.refresh()
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, CalendarDays, Check, Loader2, MapPin, MapPinned, Package as PackageIcon, Pencil, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useConfirm } from '../../finance/use-confirm'
import { isClosedEvent } from '../../jobs/tracking/tracking-logic'
import type { CategoryUnit } from '../../packages/types'
import { cancelPackingList, reopenPacking } from '../actions'
import { eventWhen, thaiDateTime } from '../format'
import { PACKING_STATUS_LABELS, canCancelList } from '../packing-logic'
import { PackingStatusChip } from '../status-chip'
import type { PackingListDetail, PackingStatus, PickupSpot } from '../types'
import ConfirmStep from './confirm-step'
import PickStep, { lineTags, routeOf } from './pick-step'
import SelectStep from './select-step'

const PILL = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium'
const STEPS: PackingStatus[] = ['selecting', 'picking', 'ready']

/** ลำดับขั้นปัจจุบันใน stepper (ออกงาน/คืนแล้ว/คืนชั้นแล้ว = ผ่านครบทั้ง 3 ขั้นของเฟสนี้) */
export const stepIndex = (status: PackingStatus) => {
  const i = STEPS.indexOf(status)
  return i === -1 ? STEPS.length : i
}

function Stepper({ status }: { status: PackingStatus }) {
  const current = stepIndex(status)
  return (
    <ol className="grid grid-cols-3 gap-1.5" aria-label="ขั้นตอนใบจัดของ">
      {STEPS.map((s, i) => {
        const done = i < current || (i === current && s === 'ready')
        const active = i === current
        return (
          <li
            key={s}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex min-w-0 items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-xs font-medium sm:text-sm',
              done ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : active ? 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200' : 'border-zinc-200 text-zinc-400 dark:border-zinc-800',
            )}
          >
            {done ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="tabular-nums">{i + 1}.</span>}
            <span className="truncate">{PACKING_STATUS_LABELS[s]}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** สรุปใบที่พร้อมรับขึ้นไป: จุดรับของ + รูป + รายการตามเส้นทาง + ปุ่มแก้ไข (เฉพาะพร้อมรับ) */
function ReadySummary({ detail, closed }: { detail: PackingListDetail; closed: boolean }) {
  const { list } = detail
  const [busy, setBusy] = useState(false)
  const { confirm, dialog } = useConfirm()

  const reopen = async () => {
    const ok = await confirm({
      title: 'แก้ไขใบจัดของ?',
      description: 'ใบจะถอยเป็น "กำลังหยิบ" — ความพร้อมข้อ "จัดของ" ของงานจะกลับเป็นขาดจนกว่าจะยืนยันใหม่ รูปเดิมยังอยู่',
      variant: 'warning',
      confirmLabel: 'ถอยเป็นกำลังหยิบ',
    })
    if (!ok) return
    setBusy(true)
    const res = await reopenPacking(list.id)
    setBusy(false)
    if ('error' in res) toast.error(res.error)
    else toast.success('ถอยเป็นกำลังหยิบแล้ว')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" data-testid="packing-ready">
        <div className="flex items-center gap-1.5 font-semibold">
          <MapPinned className="h-4 w-4 shrink-0" /> {list.status === 'ready' ? 'พร้อมรับ' : PACKING_STATUS_LABELS[list.status]} — วางไว้ที่ {detail.spot?.name ?? 'ไม่ระบุจุด'}
        </div>
        <div className="mt-0.5 text-xs">จัดเสร็จเมื่อ {thaiDateTime(list.packed_at)}</div>
      </div>

      {list.photo_urls.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {list.photo_urls.map(url => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="รูปชุดที่จัดเสร็จ" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {routeOf(detail.lines).map(g => (
          <section key={g.key} className="space-y-1">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <MapPin className="h-4 w-4 shrink-0 text-violet-600" /> <span className="wrap-break-word">{g.label}</span>
            </h3>
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
              {g.lines.map(l => (
                <li key={l.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="min-w-0">
                    <div className="font-medium wrap-break-word">
                      {l.unitName}
                      {l.variant && <span className="ml-1 text-xs font-normal text-violet-700 dark:text-violet-300">({l.variant})</span>}
                    </div>
                    <div className="text-xs text-zinc-500 wrap-break-word">{lineTags(l)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {list.status === 'ready' && !closed && (
        <Button variant="outline" className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={reopen}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-1 h-4 w-4" />}
          แก้ไข (ถอยเป็นกำลังหยิบ)
        </Button>
      )}
      {list.status !== 'ready' && <p className="text-xs text-muted-foreground">ใบนี้ถูกรับของไปแล้ว — แก้ไขไม่ได้</p>}
      {dialog}
    </div>
  )
}

export default function PackingListView({ detail, extraUnits, spots }: { detail: PackingListDetail; extraUnits: CategoryUnit[]; spots: PickupSpot[] }) {
  const router = useRouter()
  const { list, event, lead } = detail
  const closed = isClosedEvent(event.status)
  const [cancelling, setCancelling] = useState(false)
  const { confirm, dialog } = useConfirm()
  const picked = detail.lines.filter(l => l.picked_at).length

  const cancel = async () => {
    const ok = await confirm({
      title: 'ยกเลิกใบจัดของนี้?',
      description: 'ของที่หยิบแล้วจะคืนสถานะเป็นใช้ได้ การจองกระเป๋าของใบนี้จะถูกยกเลิก และใบจะหายไป (เปิดใบใหม่ได้ภายหลัง)',
      variant: 'destructive',
      confirmLabel: 'ยกเลิกใบ',
      cancelLabel: 'ไม่ยกเลิก',
    })
    if (!ok) return
    setCancelling(true)
    const res = await cancelPackingList(list.id)
    if ('error' in res) {
      setCancelling(false)
      toast.error(res.error)
      return
    }
    toast.success('ยกเลิกใบจัดของแล้ว')
    router.push('/packing')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-6">
      <div className="flex items-start gap-2">
        <Link href="/packing" className="shrink-0">
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="กลับไปคิวใบจัดของ">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight wrap-break-word md:text-2xl">{lead?.customer_name || event.name}</h2>
            <PackingStatusChip status={list.status} picked={picked} total={detail.lines.length} />
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
          {detail.leadPackages.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {detail.leadPackages.map(p => (
                <span key={p.id} className={cn(PILL, 'gap-1 bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300')}>
                  <PackageIcon className="h-3 w-3" /> {p.packageName}
                  {p.quantity > 1 && ` ×${p.quantity}`}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <Stepper status={list.status} />

      {closed && (
        <div className="rounded-lg border border-zinc-300 bg-zinc-100 p-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          อีเวนต์นี้ปิดงานไปแล้ว — ดูได้อย่างเดียว แก้ใบจัดของไม่ได้
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {list.status !== 'selecting' && (
          <Link href={`/packing/${list.id}/print`} className="sm:w-auto">
            <Button variant="outline" className="min-h-11 w-full">
              <Printer className="mr-1 h-4 w-4" /> พิมพ์ใบจัดของ
            </Button>
          </Link>
        )}
        {canCancelList(list.status) && !closed && (
          <Button variant="outline" className="min-h-11 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300" disabled={cancelling} onClick={cancel}>
            {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
            ยกเลิกใบ
          </Button>
        )}
      </div>

      {list.status === 'selecting' && <SelectStep key={list.updated_at} detail={detail} extraUnits={extraUnits} />}
      {list.status === 'picking' && (
        <>
          <PickStep detail={detail} extraUnits={extraUnits} />
          <ConfirmStep detail={detail} spots={spots} />
        </>
      )}
      {list.status !== 'selecting' && list.status !== 'picking' && <ReadySummary detail={detail} closed={closed} />}
      {dialog}
    </div>
  )
}
