// หน้าจุดรับของ — ชื่อจุด + ใบจัดของที่วางไว้ 3 กลุ่ม: พร้อมรับ (รับของ) · ออกงาน (คืนของ) · คืนแล้ว (รอทีมจัดของคืนชั้น)
// ไม่มี state เอง (server component) — เช็กลิสต์รับของ/คืนของเป็น client component แยกไฟล์ (handover-sheet / return-sheet)
// canAct = ผู้รับของ (getHandoverUser) · ไม่ใช่ = ดูอย่างเดียว · ใบเดียวที่จุดนี้ = เปิดเช็กลิสต์ให้เลย
import type { ReactNode } from 'react'
import Link from 'next/link'
import { CalendarDays, Clock, Eye, MapPin, MapPinned, UserRound } from 'lucide-react'
import { eventWhen } from '../../packing/format'
import { PackingStatusChip } from '../../packing/status-chip'
import type { PickupCard, PickupSpot } from '../../packing/types'
import HandoverSheet from './handover-sheet'
import ReturnSheet from './return-sheet'

function CardHead({ c }: { c: PickupCard }) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold wrap-break-word">{c.customerName || c.eventName}</span>
        {c.list && <PackingStatusChip status={c.list.status} />}
        {c.isMine && (
          <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
            <UserRound className="h-3 w-3" /> งานของคุณ
          </span>
        )}
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
}

function Group({ title, hint, cards, children }: { title: string; hint: string; cards: PickupCard[]; children: (c: PickupCard) => ReactNode }) {
  if (cards.length === 0) return null
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-base font-semibold">
          {title} <span className="font-normal text-zinc-400 tabular-nums">({cards.length})</span>
        </h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <ul className="space-y-2">
        {cards.map(c => (
          <li key={c.list?.id ?? c.eventId} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            {children(c)}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function PickupView({
  spot,
  lists,
  canOpenLists,
  canAct = false,
  loadError = null,
}: {
  spot: PickupSpot
  lists: PickupCard[]
  canOpenLists: boolean
  canAct?: boolean
  loadError?: string | null
}) {
  const ready = lists.filter(c => c.list?.status === 'ready')
  const out = lists.filter(c => c.list?.status === 'out')
  const returned = lists.filter(c => c.list?.status === 'returned')
  const single = ready.length + out.length === 1

  const openLink = (c: PickupCard) =>
    canOpenLists && c.list ? (
      <Link href={`/packing/${c.list.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-violet-700 dark:text-violet-300">
        เปิดใบจัดของ →
      </Link>
    ) : null

  const viewOnly = (text: string) => (
    <div className="flex items-start gap-1.5 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
      <Eye className="mt-0.5 h-4 w-4 shrink-0" /> {text}
    </div>
  )

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-6">
      <div>
        <div className="text-xs text-muted-foreground">จุดรับของ</div>
        <h2 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight wrap-break-word">
          <MapPinned className="h-6 w-6 shrink-0 text-emerald-600" /> {spot.name}
          <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{spot.code}</span>
        </h2>
        {spot.note && <p className="text-sm text-muted-foreground wrap-break-word">{spot.note}</p>}
        {!spot.is_active && <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">จุดนี้ปิดใช้แล้ว</p>}
        <p className="mt-1 text-sm text-muted-foreground">
          {canAct ? 'รับของ: ติ๊กทุกชิ้นขณะขึ้นรถแล้วยืนยัน · คืนของ: วางของที่จุดนี้ ระบุสภาพแล้วยืนยัน' : 'ดูได้อย่างเดียว — รับของ/คืนของได้เฉพาะแอดมินหรือผู้ที่มีสิทธิ์อีเวนต์/สต็อก'}
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{loadError}</div>
      )}

      {!loadError && lists.length === 0 && <div className="rounded-xl border-2 border-dashed p-10 text-center text-sm text-muted-foreground">ยังไม่มีของวางที่จุดนี้</div>}

      <Group title="พร้อมรับ" hint="ทีมจัดของจัดเสร็จแล้ว — รับของขึ้นรถ" cards={ready}>
        {c => (
          <>
            <CardHead c={c} />
            {canAct ? <HandoverSheet card={c} initialOpen={single} /> : viewOnly('พร้อมรับ — รอผู้มีสิทธิ์กดรับของ')}
            {openLink(c)}
          </>
        )}
      </Group>

      <Group title="ออกงาน" hint="รับของไปแล้ว — กลับถึงออฟฟิศ วางของที่จุดนี้แล้วกดคืนของ" cards={out}>
        {c => (
          <>
            <CardHead c={c} />
            {canAct ? <ReturnSheet card={c} initialOpen={single} /> : viewOnly('ออกงานอยู่ — รอผู้มีสิทธิ์กดคืนของ')}
            {openLink(c)}
          </>
        )}
      </Group>

      <Group title="คืนแล้ว" hint="คืนของแล้ว ของยังวางอยู่ที่จุดนี้" cards={returned}>
        {c => (
          <>
            <CardHead c={c} />
            <div className="space-y-1 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300" data-testid="returned-note">
              <div className="flex items-start gap-1.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" /> คืนแล้ว — รอทีมจัดของคืนชั้น
              </div>
              {!c.eventClosed && <div className="pl-5.5 text-amber-700 dark:text-amber-400">อีเวนต์ยังไม่ปิด — รอผู้มีสิทธิ์ปิดงาน</div>}
            </div>
            {openLink(c)}
          </>
        )}
      </Group>
    </div>
  )
}
