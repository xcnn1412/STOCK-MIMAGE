// การ์ดแจ้งเตือนชั้นเก็บของบนแดชบอร์ดสต็อก (server component) — ไม่มีอะไรต้องตาม = ไม่แสดง
import Link from 'next/link'
import { AlertTriangle, ClipboardCheck, Briefcase, Package } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { AUDIT_DUE_DAYS } from '@/app/(authenticated)/shelves/shelf-logic'
import type { ShelfHealth } from '@/app/(authenticated)/shelves/queries'

const MAX_LISTED = 6

export default function ShelfAlerts({ health }: { health: ShelfHealth }) {
  const { shelfCount, dueShelves, missingShelves, kitsWithoutShelf, looseItemsWithoutShelf } = health
  // ยังไม่ได้เริ่มใช้ชั้นเก็บของ → ไม่เตือนเรื่องของที่ยังไม่มีชั้น
  if (shelfCount === 0) return null
  if (dueShelves.length === 0 && missingShelves.length === 0 && kitsWithoutShelf === 0 && looseItemsWithoutShelf === 0) return null

  const chip = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium hover:underline'

  return (
    <Card className="p-4 border-amber-300 dark:border-amber-700 space-y-3">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 text-amber-600" /> ชั้นเก็บของที่ต้องตาม
      </div>

      {missingShelves.length > 0 && (
        <div className="text-sm space-y-1">
          <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> ตรวจล่าสุดแล้วของไม่ครบ {missingShelves.length} ชั้น
          </div>
          <div className="flex flex-wrap gap-1.5">
            {missingShelves.slice(0, MAX_LISTED).map(s => (
              <Link key={s.id} href={`/shelves/${s.id}`} className={`${chip} bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200`}>
                {s.code} · ไม่เจอ {s.missing}
              </Link>
            ))}
            {missingShelves.length > MAX_LISTED && <span className="text-xs text-muted-foreground">+{missingShelves.length - MAX_LISTED}</span>}
          </div>
        </div>
      )}

      {dueShelves.length > 0 && (
        <div className="text-sm space-y-1">
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
            <ClipboardCheck className="h-3.5 w-3.5" /> ไม่ได้ตรวจนับเกิน {AUDIT_DUE_DAYS} วัน / ยังไม่เคยตรวจ {dueShelves.length} ชั้น
          </div>
          <div className="flex flex-wrap gap-1.5">
            {dueShelves.slice(0, MAX_LISTED).map(s => (
              <Link key={s.id} href={`/shelves/${s.id}`} className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100`}>
                {s.code} · {s.days === null ? 'ยังไม่เคย' : `${s.days} วัน`}
              </Link>
            ))}
            {dueShelves.length > MAX_LISTED && <span className="text-xs text-muted-foreground">+{dueShelves.length - MAX_LISTED}</span>}
          </div>
        </div>
      )}

      {(kitsWithoutShelf > 0 || looseItemsWithoutShelf > 0) && (
        <div className="flex flex-wrap gap-3 text-sm text-zinc-600 dark:text-zinc-300">
          {kitsWithoutShelf > 0 && (
            <Link href="/kits" className="inline-flex items-center gap-1.5 hover:underline">
              <Briefcase className="h-3.5 w-3.5" /> กระเป๋ายังไม่มีชั้น {kitsWithoutShelf} ใบ
            </Link>
          )}
          {looseItemsWithoutShelf > 0 && (
            <Link href="/items" className="inline-flex items-center gap-1.5 hover:underline">
              <Package className="h-3.5 w-3.5" /> อุปกรณ์แยกชิ้นยังไม่มีชั้น {looseItemsWithoutShelf} ชิ้น
            </Link>
          )}
        </div>
      )}
    </Card>
  )
}
