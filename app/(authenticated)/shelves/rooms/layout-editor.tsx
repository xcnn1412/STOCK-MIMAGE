'use client'

// จัดผังห้อง (มองจากด้านบน) — ลากชั้นวางไปวางตามช่อง ปล่อยแล้วบันทึกทันที
// ทับกันได้แต่ขึ้นกรอบแดงเตือน (ไม่บล็อก)

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { clampToRoom, footprint, overlapping, type RackPlacement } from '../room-logic'
import { updateRack } from '../room-actions'
import type { RoomData } from '../queries'

const CELL = 44

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
    return { cx: Math.floor((e.clientX - rect.left) / CELL), cy: Math.floor((e.clientY - rect.top) / CELL) }
  }

  return (
    <div className="overflow-auto rounded-lg border bg-zinc-50 dark:bg-zinc-900 p-3">
      <div
        ref={gridRef}
        className="relative touch-none select-none"
        style={{
          width: room.width * CELL,
          height: room.depth * CELL,
          backgroundImage:
            'linear-gradient(to right, rgb(212 212 216) 1px, transparent 1px), linear-gradient(to bottom, rgb(212 212 216) 1px, transparent 1px)',
          backgroundSize: `${CELL}px ${CELL}px`,
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
        onPointerDown={e => {
          if (e.target === gridRef.current) onSelect(null)
        }}
      >
        {/* ด้านหน้าห้อง */}
        <div className="absolute -bottom-5 left-0 right-0 text-center text-[10px] text-muted-foreground">ด้านหน้า / ประตู</div>
        {racks.map(r => {
          const { w, d } = footprint(r)
          return (
            <div
              key={r.id}
              className={cn(
                'absolute flex items-center justify-center rounded border-2 text-xs font-bold cursor-grab active:cursor-grabbing',
                'transition-[left,top] duration-150 ease-out',
                r.id === selectedId ? 'bg-violet-500 text-white border-violet-700' : 'bg-white dark:bg-zinc-800 border-zinc-400',
                clash.has(r.id) && 'border-rose-500 ring-2 ring-rose-300'
              )}
              style={{ left: r.x * CELL + 2, top: r.y * CELL + 2, width: w * CELL - 4, height: d * CELL - 4 }}
              onPointerDown={e => {
                e.stopPropagation()
                ;(e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId)
                onSelect(r.id)
                const { cx, cy } = cellAt(e)
                setDrag({ id: r.id, dx: cx - r.x, dy: cy - r.y, x: r.x, y: r.y })
              }}
              title={`ชั้นวาง ${room.racks.find(x => x.id === r.id)?.code}`}
            >
              {room.racks.find(x => x.id === r.id)?.code}
            </div>
          )
        })}
      </div>
      {clash.size > 0 && <p className="mt-6 text-xs text-rose-600">⚠️ มีชั้นวางทับกัน (กรอบแดง)</p>}
    </div>
  )
}
