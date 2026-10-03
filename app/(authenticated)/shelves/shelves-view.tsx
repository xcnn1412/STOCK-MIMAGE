'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Layers, Plus, Briefcase, Package, Box } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { auditDue, groupByZone } from './shelf-logic'
import ShelfFormDialog from './shelf-form-dialog'
import { createShelf } from './actions'
import { createRoom } from './room-actions'
import FormDialog from './form-dialog'

export interface ShelfRow {
  id: string
  zone: string
  code: string
  name: string | null
  note: string | null
  kitCount: number
  itemCount: number
  lastAuditAt: string | null
  lastMissing: number
}

export interface RoomRow {
  id: string
  name: string
  width: number
  depth: number
  rackCount: number
  levelCount: number
  thingCount: number
  missingLevels: number
  dueLevels: number
}

export default function ShelvesView({ shelves, rooms, canManage }: { shelves: ShelfRow[]; rooms: RoomRow[]; canManage: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [roomOpen, setRoomOpen] = useState(false)
  const [now] = useState(() => new Date())
  const zones = groupByZone(shelves)

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">ชั้นเก็บของ</h1>
          <p className="text-sm text-muted-foreground mt-1">สแกน QR ที่ชั้นเพื่อดูว่ามีกระเป๋าและอุปกรณ์อะไรอยู่บ้าง</p>
        </div>
        {canManage && (
          <Button onClick={() => setRoomOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> สร้างห้อง
          </Button>
        )}
      </div>

      {/* ห้อง (3D) */}
      {rooms.length === 0 && zones.length === 0 && (
        <div className="rounded-xl border-2 border-dashed p-12 text-center text-muted-foreground">
          <Box className="mx-auto h-10 w-10 mb-3 opacity-40" />
          ยังไม่มีห้องเก็บของ{canManage ? ' — กด "สร้างห้อง" แล้วเพิ่มชั้นวางในห้อง' : ''}
        </div>
      )}
      {rooms.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">ห้องเก็บของ</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rooms.map(r => (
              <Link key={r.id} href={`/shelves/rooms/${r.id}`}>
                <Card className="p-4 h-full hover:shadow-md hover:border-violet-300 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                      <Box className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.width} × {r.depth} ช่อง · ชั้นวาง {r.rackCount} · {r.levelCount} ระดับ · ของ {r.thingCount}
                      </div>
                      {r.missingLevels > 0 && <div className="mt-1 text-xs font-medium text-rose-600">ตรวจล่าสุดของไม่ครบ {r.missingLevels} ระดับ</div>}
                      {r.missingLevels === 0 && r.dueLevels > 0 && <div className="mt-1 text-xs text-amber-600">ถึงกำหนดตรวจนับ {r.dueLevels} ระดับ</div>}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(zones.length > 0 || canManage) && rooms.length + zones.length > 0 && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5"><Layers className="h-4 w-4" /> ชั้นที่ยังไม่อยู่ในห้อง</h2>
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> เพิ่มชั้นเดี่ยว
            </Button>
          )}
        </div>
      )}
      {zones.length > 0 && rooms.length > 0 && (
        <p className="text-xs text-muted-foreground -mt-4">ย้ายเข้าชั้นวางได้จากหน้าห้อง (เลือกชั้นวาง → &quot;ย้ายชั้นเดิมเข้าเป็นระดับบนสุด&quot;) QR เดิมยังใช้ได้</p>
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
                  <AuditBadge due={auditDue(s.lastAuditAt, now)} missing={s.lastMissing} />
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

      {canManage && roomOpen && (
        <FormDialog
          title="สร้างห้อง"
          fields={[
            { key: 'name', label: 'ชื่อห้อง', placeholder: 'เช่น ห้องเก็บของชั้น 1', initial: '' },
            { key: 'width', label: 'กว้าง (ช่อง)', type: 'number', initial: '8' },
            { key: 'depth', label: 'ลึก (ช่อง)', type: 'number', initial: '6' },
          ]}
          hint="1 ช่อง ≈ ความกว้างชั้นวางครึ่งตู้ ใช้วางผัง ปรับขนาดทีหลังได้"
          onClose={() => setRoomOpen(false)}
          onSubmit={async v => {
            const res = await createRoom({ name: v.name, width: Number(v.width), depth: Number(v.depth) })
            if (res.error) {
              toast.error(res.error)
              return false
            }
            router.push(`/shelves/rooms/${res.id}`)
            return true
          }}
        />
      )}

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

function AuditBadge({ due, missing }: { due: ReturnType<typeof auditDue>; missing: number }) {
  if (due.kind === 'never') return <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">ยังไม่เคยตรวจนับ</div>
  if (missing > 0) return <div className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">ตรวจล่าสุด: ไม่เจอ {missing}</div>
  if (due.kind === 'overdue') return <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">ไม่ได้ตรวจ {due.days} วัน</div>
  return <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">ตรวจแล้ว {due.days === 0 ? 'วันนี้' : `${due.days} วันก่อน`}</div>
}
