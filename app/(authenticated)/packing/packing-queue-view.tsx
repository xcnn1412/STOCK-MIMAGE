'use client'

// คิว /packing ของทีมจัดของ — 3 กลุ่ม: รอเปิดใบ · กำลังทำ (เลือกของ/กำลังหยิบ) · พร้อมรับ
// ปุ่ม "เปิดใบจัดของ" = createPackingList แล้วไปหน้าใบ · การ์ดที่มีใบแล้วกดเปิดใบได้ทั้งการ์ด
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarDays, ClipboardList, Loader2, MapPin, MapPinned, Package as PackageIcon, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createPackingList } from './actions'
import { eventWhen } from './format'
import { PackingStatusChip } from './status-chip'
import type { PackingQueue, PackingQueueCard } from './types'

const PILL = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium'

/** ข้อมูลงานบนการ์ด: ลูกค้า อีเวนต์ วันงาน/เวลา สถานที่ แพ็กเกจ + สถานะใบ (ถ้ามี) */
export function QueueCardBody({ card }: { card: PackingQueueCard }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="font-semibold wrap-break-word">{card.customerName || card.eventName}</div>
      {card.customerName && card.eventName !== card.customerName && <div className="text-xs text-zinc-500 wrap-break-word">{card.eventName}</div>}
      <div className="flex items-start gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
        <span>{eventWhen(card.eventDate, card.eventTime, card.eventEndTime)}</span>
      </div>
      {card.location && (
        <div className="flex items-start gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <span className="wrap-break-word">{card.location}</span>
        </div>
      )}
      {card.packageNames.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.packageNames.map(n => (
            <span key={n} className={cn(PILL, 'gap-1 bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300')}>
              <PackageIcon className="h-3 w-3" /> {n}
            </span>
          ))}
        </div>
      )}
      {card.list && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <PackingStatusChip status={card.list.status} picked={card.list.pickedCount} total={card.list.lineCount} />
          {card.list.status !== 'picking' && (
            <span className="text-xs text-zinc-500 tabular-nums">
              หยิบแล้ว {card.list.pickedCount}/{card.list.lineCount}
            </span>
          )}
          {card.spotName && (
            <span className={cn(PILL, 'gap-1 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200')}>
              <MapPinned className="h-3 w-3" /> {card.spotName}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  hint,
  cards,
  empty,
  children,
}: {
  title: string
  hint: string
  cards: PackingQueueCard[]
  empty: string
  children: (c: PackingQueueCard) => ReactNode
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-base font-semibold">
          {title} <span className="font-normal text-zinc-400 tabular-nums">({cards.length})</span>
        </h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(children)}</div>
      )}
    </section>
  )
}

export default function PackingQueueView({ queue, loadError = null }: { queue: PackingQueue; loadError?: string | null }) {
  const router = useRouter()
  const [opening, setOpening] = useState<string | null>(null)

  const open = async (card: PackingQueueCard) => {
    if (!card.leadId) return
    setOpening(card.eventId)
    const res = await createPackingList(card.leadId, card.eventId)
    if ('error' in res) {
      setOpening(null)
      toast.error(res.error)
      return
    }
    toast.success('เปิดใบจัดของแล้ว')
    router.push(`/packing/${res.id}`)
  }

  const listCard = (c: PackingQueueCard) =>
    c.list ? (
      <Link
        key={c.list.id}
        href={`/packing/${c.list.id}`}
        className="block rounded-xl border border-zinc-200 bg-white p-3 transition-colors hover:border-violet-300 hover:bg-violet-50/40 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-violet-800 dark:hover:bg-violet-950/20"
      >
        <QueueCardBody card={c} />
        <div className="mt-2 text-sm font-medium text-violet-700 dark:text-violet-300">เปิดใบ →</div>
      </Link>
    ) : null

  const total = queue.awaiting.length + queue.active.length + queue.ready.length

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
          <ClipboardList className="h-6 w-6 text-zinc-500" /> ใบจัดของ
        </h2>
        <p className="text-sm text-muted-foreground">เลือกของตามแพ็กเกจของงาน เดินหยิบตามชั้น ถ่ายรูปยืนยัน แล้ววางที่จุดรับของ</p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{loadError}</div>
      )}
      {!loadError && total === 0 && (
        <div className="rounded-xl border-2 border-dashed p-10 text-center text-sm text-muted-foreground">
          ยังไม่มีงานให้จัดของ — งานที่ลูกค้าตอบรับแล้วและทีมขายเลือกแพ็กเกจไว้จะขึ้นที่นี่
        </div>
      )}

      <Section title="รอเปิดใบ" hint="งานที่ตอบรับแล้วและมีแพ็กเกจ แต่อีเวนต์ยังไม่มีใบจัดของ" cards={queue.awaiting} empty="ไม่มีงานที่รอเปิดใบ">
        {c => (
          <div key={c.eventId} className="flex flex-col justify-between gap-3 rounded-xl border border-amber-200 bg-white p-3 dark:border-amber-900/60 dark:bg-zinc-950">
            <QueueCardBody card={c} />
            <Button className="min-h-11 w-full" disabled={opening !== null || !c.leadId} onClick={() => open(c)}>
              {opening === c.eventId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              เปิดใบจัดของ
            </Button>
          </div>
        )}
      </Section>

      <Section title="กำลังทำ" hint="ใบที่อยู่ในขั้นเลือกของหรือกำลังหยิบ" cards={queue.active} empty="ไม่มีใบที่กำลังทำ">
        {listCard}
      </Section>

      <Section title="พร้อมรับ" hint="จัดเสร็จแล้ว วางไว้ที่จุดรับของ รอทีมหน้างานมารับ" cards={queue.ready} empty="ยังไม่มีใบที่พร้อมรับ">
        {listCard}
      </Section>
    </div>
  )
}
