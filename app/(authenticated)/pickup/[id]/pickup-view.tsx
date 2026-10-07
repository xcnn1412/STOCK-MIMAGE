// หน้าจุดรับของแบบอ่านอย่างเดียว (เฟส 3) — ชื่อจุด + ใบจัดของที่วางไว้ (พร้อมรับ / ออกงาน) · ไม่มี state จึงเป็น server component
// ปุ่มรับของ/คืนของมาในเฟส 4
import Link from 'next/link'
import { CalendarDays, Info, MapPin, MapPinned } from 'lucide-react'
import { eventWhen } from '../../packing/format'
import { PackingStatusChip } from '../../packing/status-chip'
import type { PackingQueueCard, PickupSpot } from '../../packing/types'

export default function PickupView({ spot, lists, canOpenLists }: { spot: PickupSpot; lists: PackingQueueCard[]; canOpenLists: boolean }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <div className="text-xs text-muted-foreground">จุดรับของ</div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight wrap-break-word">
          <MapPinned className="h-6 w-6 shrink-0 text-emerald-600" /> {spot.name}
          <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{spot.code}</span>
        </h2>
        {spot.note && <p className="text-sm text-muted-foreground wrap-break-word">{spot.note}</p>}
        {!spot.is_active && <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">จุดนี้ปิดใช้แล้ว</p>}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>ปุ่มรับของ/คืนของมาในรุ่นถัดไป — ตอนนี้ดูได้ว่าของงานไหนวางอยู่ที่จุดนี้</span>
      </div>

      {lists.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-10 text-center text-sm text-muted-foreground">ยังไม่มีของวางที่จุดนี้</div>
      ) : (
        <ul className="space-y-2">
          {lists.map(c => {
            const body = (
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold wrap-break-word">{c.customerName || c.eventName}</span>
                  {c.list && <PackingStatusChip status={c.list.status} />}
                </div>
                {c.customerName && c.eventName !== c.customerName && <div className="text-xs text-zinc-500 wrap-break-word">{c.eventName}</div>}
                <div className="flex items-start gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                  {eventWhen(c.eventDate, c.eventTime, c.eventEndTime)}
                </div>
                {c.location && (
                  <div className="flex items-start gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                    <span className="wrap-break-word">{c.location}</span>
                  </div>
                )}
                {c.list && <div className="text-xs text-zinc-500 tabular-nums">{c.list.lineCount} รายการ</div>}
              </div>
            )
            return (
              <li key={c.list?.id ?? c.eventId}>
                {canOpenLists && c.list ? (
                  <Link
                    href={`/packing/${c.list.id}`}
                    className="block min-h-11 rounded-xl border border-zinc-200 bg-white p-3 hover:border-violet-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-violet-800"
                  >
                    {body}
                    <div className="mt-1 text-sm font-medium text-violet-700 dark:text-violet-300">เปิดใบ →</div>
                  </Link>
                ) : (
                  <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
