// ============================================================================
// กล่องแดง "รายการค้างเคลียร์" + ป้ายจำนวนค้าง — ไม่มี hook ใช้ได้ทั้ง server/client component และในชุดตรวจ
// ตรวจด้วย outstanding-alert.check.tsx
// ============================================================================

import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { outstandingLabel, type OutstandingKind } from './claim-rules'

type Item = { id: string; claim_number: string; title: string; kind: OutstandingKind }

export function OutstandingAlert({ claims, isEn, mode }: { claims: Item[]; isEn: boolean; mode: 'block' | 'notice' }) {
  if (claims.length === 0) return null
  const n = claims.length
  const heading = mode === 'block'
    ? (isEn ? `Cannot create a new claim — ${n} item(s) still outstanding` : `เบิกใหม่ไม่ได้ — ยังมีรายการค้างเคลียร์ ${n} ใบ`)
    : (isEn ? `This claimant still has ${n} outstanding item(s)` : `ผู้เบิกคนนี้ยังมีรายการค้างเคลียร์ ${n} ใบ`)
  return (
    <div
      role="alert"
      data-testid="outstanding-alert"
      className="rounded-xl border border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 p-4"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{heading}</p>
          {mode === 'block' && (
            <p className="text-sm mt-0.5">{isEn ? 'Clear them first, then create a new claim.' : 'เคลียร์ให้ครบก่อน แล้วค่อยสร้างใบเบิกใหม่'}</p>
          )}
          <ul className="mt-2 space-y-1 text-sm">
            {claims.map(c => (
              <li key={c.id}>
                <Link href={`/finance/${c.id}`} className="underline underline-offset-2 hover:no-underline">
                  {c.claim_number} · {c.title} · {outstandingLabel(c.kind, isEn)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function OutstandingPill({ count, isEn }: { count: number; isEn: boolean }) {
  if (!(count > 0)) return null // แถวจาก listHiddenClaims ไม่มีตัวเลขนี้
  return (
    <span
      data-testid="outstanding-pill"
      className="inline-flex items-center whitespace-nowrap bg-red-600 text-white rounded-full text-[10px] font-bold px-1.5 py-0.5"
    >
      {isEn ? `${count} outstanding` : `ค้าง ${count} ใบ`}
    </span>
  )
}
