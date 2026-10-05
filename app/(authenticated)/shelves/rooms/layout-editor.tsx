'use client'

// จัดผังห้อง (มองจากด้านบน) — ลากชั้นวางไปวางตามช่อง ปล่อยแล้วบันทึกทันที (ใช้นิ้วลากบนมือถือได้)
// ผังย่อตามความกว้างจอ: ตำแหน่ง/ขนาดคิดเป็น % ของห้อง · ทับกันได้แต่ขึ้นกรอบแดงเตือน (ไม่บล็อก)
// แถบขอบห้อง 4 ด้าน = ผนัง กดช่องเพื่อปักหมุดประตูทางเข้า (กดซ้ำเอาออก)

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { clampToRoom, footprint, overlapping, wallLength, DOOR_SIDES, type Door, type DoorSide, type RackPlacement } from '../room-logic'
import { setRoomDoor, updateRack } from '../room-actions'
import type { RoomData } from '../queries'

/** ขนาดช่องสูงสุด (px) — จอแคบกว่านี้ผังย่อลงให้พอดี */
const MAX_CELL = 44

export default function LayoutEditor({
  room,
  selectedId,
  onSelect,
  onSaved,
}: {
  room: RoomData
  selectedId: string | null
  onSelect: (id: string | null) => void
  onSaved: () => void
}) {
  const gridRef = useRef<HTMLDivElement>(null)
  // ตำแหน่งระหว่างลาก (ยังไม่บันทึก) — ปล่อยแล้วค่อยบันทึก
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null)
  // ตำแหน่งที่เพิ่งวาง รอ props จาก server — ใช้ได้ตราบที่ props ยังเป็นค่าก่อนย้าย (ไม่เด้งกลับที่เดิมแวบหนึ่ง)
  const [pending, setPending] = useState<{ id: string; x: number; y: number; fromX: number; fromY: number } | null>(null)

  const racks: RackPlacement[] = room.racks.map(r => {
    if (drag?.id === r.id) return { ...r, x: drag.x, y: drag.y }
    if (pending?.id === r.id && pending.fromX === r.x && pending.fromY === r.y) return { ...r, x: pending.x, y: pending.y }
    return r
  })
  const clash = overlapping(racks)

  const cellAt = (e: React.PointerEvent) => {
    const rect = gridRef.current!.getBoundingClientRect()
    return {
      cx: Math.floor(((e.clientX - rect.left) / rect.width) * room.width),
      cy: Math.floor(((e.clientY - rect.top) / rect.height) * room.depth),
    }
  }
  const pct = (n: number, of: number) => `${(n / of) * 100}%`

  const pickDoor = async (side: DoorSide, pos: number) => {
    const same = room.door?.side === side && room.door.pos === pos
    const res = await setRoomDoor(room.id, same ? null : { side, pos })
    if (res.error) toast.error(res.error)
    else onSaved()
  }

  return (
    <div className="rounded-lg border bg-zinc-50 dark:bg-zinc-900 p-5 pb-14">
      <div
        ref={gridRef}
        className="relative mx-auto touch-none select-none border-b border-r border-zinc-300 dark:border-zinc-700"
        style={{
          width: '100%',
          maxWidth: room.width * MAX_CELL,
          aspectRatio: `${room.width} / ${room.depth}`,
          backgroundImage:
            'linear-gradient(to right, rgb(212 212 216) 1px, transparent 1px), linear-gradient(to bottom, rgb(212 212 216) 1px, transparent 1px)',
          backgroundSize: `${100 / room.width}% ${100 / room.depth}%`,
        }}
        onPointerMove={e => {
          if (!drag) return
          const { cx, cy } = cellAt(e)
          const r = room.racks.find(r => r.id === drag.id)!
          const placed = clampToRoom({ ...r, x: cx - drag.dx, y: cy - drag.dy }, room)
          if (placed.x !== drag.x || placed.y !== drag.y) setDrag({ ...drag, x: placed.x, y: placed.y })
        }}
        onPointerUp={async () => {
          if (!drag) return
          const r = room.racks.find(r => r.id === drag.id)!
          const moved = r.x !== drag.x || r.y !== drag.y
          const target = { x: drag.x, y: drag.y }
          if (!moved) {
            setDrag(null)
            return
          }
          setPending({ id: drag.id, ...target, fromX: r.x, fromY: r.y })
          setDrag(null)
          const res = await updateRack(drag.id, target)
          if (res.error) {
            toast.error(res.error)
            setPending(null)
          } else onSaved()
        }}
        onPointerCancel={() => setDrag(null)}
        onPointerDown={e => {
          if (e.target === gridRef.current) onSelect(null)
        }}
      >
        {/* ผนัง 4 ด้าน — กดเพื่อปักหมุดประตู */}
        {DOOR_SIDES.map(side => (
          <Wall key={side} side={side} cells={wallLength(room, side)} door={room.door} onPick={pickDoor} />
        ))}
        {/* ด้านหน้าห้อง */}
        <div className="pointer-events-none absolute -bottom-9 left-0 right-0 text-center text-[10px] text-muted-foreground">
          ด้านหน้า{room.door ? '' : ' · กดแถบขอบห้องเพื่อปักหมุดประตูทางเข้า'}
        </div>
        {racks.map(r => {
          const { w, d } = footprint(r)
          const code = room.racks.find(x => x.id === r.id)?.code
          return (
            <div
              key={r.id}
              className="absolute cursor-grab p-0.5 transition-[left,top] duration-150 ease-out active:cursor-grabbing"
              style={{ left: pct(r.x, room.width), top: pct(r.y, room.depth), width: pct(w, room.width), height: pct(d, room.depth) }}
              onPointerDown={e => {
                e.stopPropagation()
                ;(e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId)
                onSelect(r.id)
                const { cx, cy } = cellAt(e)
                setDrag({ id: r.id, dx: cx - r.x, dy: cy - r.y, x: r.x, y: r.y })
              }}
              title={`ชั้นวาง ${code}`}
            >
              <div
                className={cn(
                  'flex h-full w-full items-center justify-center overflow-hidden rounded border-2 text-xs font-bold',
                  r.id === selectedId ? 'bg-violet-500 text-white border-violet-700' : 'bg-white dark:bg-zinc-800 border-zinc-400',
                  clash.has(r.id) && 'border-rose-500 ring-2 ring-rose-300'
                )}
              >
                {code}
              </div>
            </div>
          )
        })}
      </div>
      {clash.size > 0 && <p className="mt-6 text-xs text-rose-600">⚠️ มีชั้นวางทับกัน (กรอบแดง)</p>}
    </div>
  )
}

const WALL_POS: Record<DoorSide, string> = {
  back: '-top-4 left-0 right-0 h-3 flex-row',
  front: '-bottom-4 left-0 right-0 h-3 flex-row',
  left: '-left-4 top-0 bottom-0 w-3 flex-col',
  right: '-right-4 top-0 bottom-0 w-3 flex-col',
}

/** ผนังหนึ่งด้าน แบ่งเป็นช่องตามผัง — ช่องที่มีประตูเป็นสีส้ม */
function Wall({ side, cells, door, onPick }: { side: DoorSide; cells: number; door: Door | null; onPick: (side: DoorSide, pos: number) => void }) {
  return (
    <div className={cn('absolute flex gap-0.5', WALL_POS[side])}>
      {Array.from({ length: cells }, (_, i) => {
        const here = door?.side === side && door.pos === i
        return (
          <button
            key={i}
            type="button"
            aria-pressed={here}
            title={here ? 'เอาหมุดประตูออก' : 'ปักหมุดประตูทางเข้าที่นี่'}
            onPointerDown={e => e.stopPropagation()}
            onClick={() => onPick(side, i)}
            className={cn('flex-1 rounded-sm transition-colors', here ? 'bg-amber-500' : 'bg-zinc-200 hover:bg-amber-300 dark:bg-zinc-700 dark:hover:bg-amber-600')}
          />
        )
      })}
    </div>
  )
}
