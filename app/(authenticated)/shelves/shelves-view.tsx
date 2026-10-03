'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Layers, Plus, Briefcase, Package } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { groupByZone } from './shelf-logic'
import ShelfFormDialog from './shelf-form-dialog'
import { createShelf } from './actions'

export interface ShelfRow {
  id: string
  zone: string
  code: string
  name: string | null
  note: string | null
  kitCount: number
  itemCount: number
}

export default function ShelvesView({ shelves, canManage }: { shelves: ShelfRow[]; canManage: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const zones = groupByZone(shelves)

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">ชั้นเก็บของ</h1>
          <p className="text-sm text-muted-foreground mt-1">สแกน QR ที่ชั้นเพื่อดูว่ามีกระเป๋าและอุปกรณ์อะไรอยู่บ้าง</p>
        </div>
        {canManage && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> เพิ่มชั้น
          </Button>
        )}
      </div>

      {zones.length === 0 && (
        <div className="rounded-xl border-2 border-dashed p-12 text-center text-muted-foreground">
          <Layers className="mx-auto h-10 w-10 mb-3 opacity-40" />
          ยังไม่มีชั้นเก็บของ{canManage ? ' — กด "เพิ่มชั้น" เพื่อเริ่ม' : ''}
        </div>
      )}

      {zones.map(({ zone, shelves: list }) => (
        <section key={zone} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">โซน {zone}</h2>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {list.map(s => (
              <Link key={s.id} href={`/shelves/${s.id}`}>
                <Card className="p-4 h-full hover:shadow-md hover:border-zinc-300 transition-all">
                  <div className="text-lg font-bold tracking-tight">{s.code}</div>
                  {s.name && <div className="text-sm text-muted-foreground truncate">{s.name}</div>}
                  <div className="mt-3 flex gap-3 text-xs text-zinc-600 dark:text-zinc-300">
                    <span className="inline-flex items-center gap-1" title="กระเป๋า"><Briefcase className="h-3.5 w-3.5" /> {s.kitCount}</span>
                    <span className="inline-flex items-center gap-1" title="อุปกรณ์"><Package className="h-3.5 w-3.5" /> {s.itemCount}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {canManage && (
        <ShelfFormDialog
          open={open}
          onOpenChange={setOpen}
          title="เพิ่มชั้น"
          initial={{ zone: zones.at(-1)?.zone ?? '', code: '', name: '', note: '' }}
          onSubmit={async input => {
            const res = await createShelf(input)
            if (res.error) {
              toast.error(res.error)
              return false
            }
            toast.success(`เพิ่มชั้น ${input.code} แล้ว`)
            router.push(`/shelves/${res.id}`)
            return true
          }}
        />
      )}
    </div>
  )
}
