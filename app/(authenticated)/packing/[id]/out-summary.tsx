// สรุปใบจัดของหลังรับของ (ไม่มี state ใช้ได้ทั้ง server/client) — ออกงาน: OutSummary · คืนชั้นแล้ว: DoneSummary
// เส้นเวลา (จัดเสร็จ → รับของ → คืนของ → คืนชั้น) + รายการตามเส้นทางชั้น พร้อมสภาพตอนคืน · ใบนี้แก้ไข/ยกเลิกไม่ได้แล้ว
import Link from 'next/link'
import { CheckCircle2, MapPin, MapPinned, RotateCcw, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { thaiDateTime } from '../format'
import { ReturnConditionBadge } from '../status-chip'
import type { PackingLineView, PackingListDetail } from '../types'
import { lineTags, routeOf } from './pick-step'

/** "เมื่อ … โดย …" (ไม่มีชื่อ = ไม่บอกคน) */
export function whenBy(detail: PackingListDetail, at: string | null, by: string | null): string {
  const who = by ? detail.people[by] : null
  return who ? `${thaiDateTime(at)} โดย ${who}` : thaiDateTime(at)
}

/** เส้นเวลาของใบ — แสดงเฉพาะขั้นที่เกิดขึ้นแล้ว */
export function Timeline({ detail }: { detail: PackingListDetail }) {
  const { list } = detail
  const rows = [
    { at: list.packed_at, by: list.packed_by, label: 'จัดเสร็จ' },
    { at: list.handed_over_at, by: list.handed_over_by, label: 'รับของ' },
    { at: list.returned_at, by: list.returned_by, label: 'คืนของ' },
    { at: list.restocked_at, by: list.restocked_by, label: 'คืนชั้นครบ' },
  ].filter(r => r.at)
  if (rows.length === 0) return null
  return (
    <ol className="space-y-1 rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950" aria-label="เส้นเวลาใบจัดของ">
      {rows.map(r => (
        <li key={r.label} className="flex flex-wrap gap-x-2">
          <span className="w-20 shrink-0 font-medium">{r.label}</span>
          <span className="min-w-0 text-zinc-600 wrap-break-word dark:text-zinc-300">{whenBy(detail, r.at, r.by)}</span>
        </li>
      ))}
    </ol>
  )
}

/** รายการตามเส้นทางชั้น + ป้ายสภาพตอนคืน (ถ้ามี) */
export function LineSummaryList({ lines, showCondition = false }: { lines: PackingLineView[]; showCondition?: boolean }) {
  return (
    <div className="space-y-3">
      {routeOf(lines).map(g => (
        <section key={g.key} className="space-y-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="h-4 w-4 shrink-0 text-violet-600" /> <span className="wrap-break-word">{g.label}</span>
          </h3>
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {g.lines.map(l => (
              <li key={l.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium wrap-break-word">
                    {l.unitName}
                    {l.variant && <span className="ml-1 text-xs font-normal text-violet-700 dark:text-violet-300">({l.variant})</span>}
                  </div>
                  <div className="text-xs text-zinc-500 wrap-break-word">
                    {l.serial && <>S/N {l.serial} · </>}
                    {lineTags(l)}
                  </div>
                  {l.return_note && <div className="text-xs text-zinc-600 wrap-break-word dark:text-zinc-400">หมายเหตุ: {l.return_note}</div>}
                </div>
                {showCondition && <ReturnConditionBadge condition={l.return_condition} className="shrink-0" />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** รูป (ชุดที่จัดเสร็จ / ตอนคืน) */
export function PhotoGrid({ urls, alt }: { urls: string[]; alt: string }) {
  if (urls.length === 0) return null
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {urls.map(url => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  )
}

const BOX = 'rounded-xl border p-3'

/** ออกงาน: รับของเมื่อ … โดย … + จุด + รายการ */
export function OutSummary({ detail }: { detail: PackingListDetail }) {
  const { list, spot } = detail
  return (
    <div className="space-y-4" data-testid="packing-out">
      <div className={cn(BOX, 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100')}>
        <div className="flex items-center gap-1.5 font-semibold">
          <Truck className="h-4 w-4 shrink-0" /> ออกงาน — ทีมหน้างานรับของไปแล้ว
        </div>
        <div className="mt-0.5 text-sm">รับของเมื่อ {whenBy(detail, list.handed_over_at, list.handed_over_by)}</div>
        <div className="mt-0.5 flex items-center gap-1 text-sm">
          <MapPinned className="h-3.5 w-3.5 shrink-0" /> จากจุด {spot?.name ?? 'ไม่ระบุจุด'}
        </div>
        <p className="mt-1 text-xs">
          ใบนี้แก้ไขไม่ได้แล้ว · กลับจากงานให้คืนของที่จุดรับของ
          {spot && (
            <>
              {' '}
              <Link href={`/pickup/${spot.id}`} className="underline">
                เปิดหน้าจุดรับของ
              </Link>
            </>
          )}
        </p>
      </div>
      <Timeline detail={detail} />
      <PhotoGrid urls={list.photo_urls} alt="รูปชุดที่จัดเสร็จ" />
      <LineSummaryList lines={detail.lines} />
    </div>
  )
}

/** คืนชั้นแล้ว: จบกระบวนการ — เส้นเวลา + สภาพตอนคืน + รูปตอนคืน */
export function DoneSummary({ detail }: { detail: PackingListDetail }) {
  const { list } = detail
  const problems = detail.lines.filter(l => l.return_condition && l.return_condition !== 'available').length
  return (
    <div className="space-y-4" data-testid="packing-done">
      <div className={cn(BOX, 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100')}>
        <div className="flex items-center gap-1.5 font-semibold">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> คืนชั้นแล้ว — จบกระบวนการ
        </div>
        <div className="mt-0.5 text-sm">คืนชั้นครบเมื่อ {whenBy(detail, list.restocked_at, list.restocked_by)}</div>
        {problems > 0 && <div className="mt-0.5 text-sm text-red-700 dark:text-red-300">มีของเสีย/ซ่อม/หาย {problems} รายการ — ดูได้ในแดชบอร์ดสต็อก</div>}
      </div>
      <Timeline detail={detail} />
      {list.return_note && (
        <div className="rounded-lg bg-zinc-50 p-3 text-sm wrap-break-word dark:bg-zinc-900">
          <span className="font-medium">หมายเหตุตอนคืน:</span> {list.return_note}
        </div>
      )}
      {list.return_photo_urls.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <RotateCcw className="h-4 w-4" /> รูปตอนคืน
          </div>
          <PhotoGrid urls={list.return_photo_urls} alt="รูปตอนคืนของ" />
        </div>
      )}
      <LineSummaryList lines={detail.lines} showCondition />
    </div>
  )
}
