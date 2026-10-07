'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Plus, Briefcase, QrCode, Printer, Search } from "lucide-react"
import { DeleteKitButton } from './delete-kit-button'
import { useLanguage } from '@/contexts/language-context'
import { cn } from '@/lib/utils'
import { countProblems, kitShelfState } from '../shelves/shelf-logic'

/** การ์ดกระเป๋าหนึ่งใบ (คิดที่ page.tsx) */
export interface KitCard {
  id: string
  name: string
  description: string | null
  itemCount: number
  shelf: { id: string; code: string } | null
  /** ชื่อประเภทอุปกรณ์ของกระเป๋า (ไม่มี = null) */
  categoryName: string | null
  /** งานที่กระเป๋าผูกอยู่ (kits.event_id) */
  event: { name: string | null; event_date: string | null } | null
  /** สถานะของอุปกรณ์ปกติในกระเป๋า (ไม่รวมวัสดุสิ้นเปลือง) */
  statuses: string[]
}

const PILL = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium'
const TONE = {
  out: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  booked: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  home: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  problem: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  muted: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
}

const thaiDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : ''

export default function KitsView({ kits, canManage = false }: { kits: KitCard[]; canManage?: boolean }) {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q ? kits.filter(k => k.name.toLowerCase().includes(q)) : kits

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl font-bold tracking-tight">{t.kits.title}</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/kits/print">
            <Button variant="outline">
              <Printer className="mr-2 h-4 w-4" /> พิมพ์ QR ทั้งหมด
            </Button>
          </Link>
          {canManage && (
            <Link href="/kits/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" /> {t.kits.createKit}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {kits.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t.kits.searchPlaceholder}
            aria-label={t.kits.searchPlaceholder}
            className="h-10 pl-9"
          />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((kit) => {
          const state = kitShelfState(kit.statuses, kit.event)
          const problems = countProblems(kit.statuses)
          return (
            <Card key={kit.id} className="flex flex-col hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 min-w-0">
                  <Briefcase className="h-5 w-5 shrink-0 text-zinc-500" />
                  <span className="truncate">{kit.name}</span>
                </CardTitle>
                {kit.categoryName && <p className="truncate text-xs text-zinc-500">{kit.categoryName}</p>}
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <p className="text-sm text-zinc-500 line-clamp-2">{kit.description || t.common.noData}</p>
                <div className="text-sm">
                  <span className="font-medium">{kit.itemCount}</span> {t.kits.itemCount}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {state.kind === 'out' && (
                    <span className={cn(PILL, TONE.out)}>ออกงาน{state.eventName ? ` @ ${state.eventName}` : ''}</span>
                  )}
                  {state.kind === 'booked' && (
                    <span className={cn(PILL, TONE.booked)}>จองไว้ {state.eventName} {thaiDate(state.eventDate)}</span>
                  )}
                  {state.kind === 'home' && <span className={cn(PILL, TONE.home)}>อยู่ในคลัง</span>}
                  {kit.shelf ? (
                    <Link href={`/shelves/${kit.shelf.id}`} className={cn(PILL, TONE.muted, 'hover:underline')}>
                      ชั้น {kit.shelf.code}
                    </Link>
                  ) : (
                    <span className={cn(PILL, TONE.muted, 'text-zinc-500')}>ยังไม่มีชั้น</span>
                  )}
                  {problems > 0 && <span className={cn(PILL, TONE.problem)}>มีปัญหา {problems}</span>}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t pt-4 gap-2">
                <Link href={`/kits/${kit.id}`} className="flex-1">
                  <Button variant="outline" className="w-full">{t.kits.manage}</Button>
                </Link>
                <Link href={`/kits/${kit.id}/print`}>
                  <Button variant="ghost" size="icon" title={t.kits.printQR} aria-label={t.kits.printQR}>
                    <QrCode className="h-4 w-4" />
                  </Button>
                </Link>
                {canManage && <DeleteKitButton id={kit.id} name={kit.name} itemCount={kit.itemCount} />}
              </CardFooter>
            </Card>
          )
        })}
        {kits.length === 0 && (
          <div className="col-span-full text-center text-zinc-500 py-12 border rounded-lg border-dashed">
            {t.kits.noItems}
          </div>
        )}
        {kits.length > 0 && shown.length === 0 && (
          <div className="col-span-full text-center text-sm text-zinc-500 py-12 border rounded-lg border-dashed">
            ไม่พบกระเป๋าที่ชื่อตรงกับ “{query.trim()}”
          </div>
        )}
      </div>
    </div>
  )
}
