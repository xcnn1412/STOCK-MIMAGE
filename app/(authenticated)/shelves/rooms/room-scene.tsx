'use client'

// ฉาก 3D ของห้องเก็บของ (three.js ผ่าน @react-three/fiber) — โหลดผ่าน next/dynamic ssr:false เท่านั้น
// หน่วย: 1 = 1 ช่องบนผัง · แกน X = ซ้าย→ขวา (x บนผัง), แกน Z = หน้า→หลัง (y บนผัง), แกน Y = ความสูง

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { CanvasTexture, Plane, SRGBColorSpace, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { clampToRoom, footprint } from '../room-logic'
import type { RoomData, RoomRack, RoomLevel } from '../queries'

const LEVEL_H = 0.45
const RACK_DEPTH = 0.6
const BOARD = 0.03
const POST = 0.04

const TONE_COLOR: Record<RoomLevel['things'][number]['tone'], string> = {
  home: '#8b5cf6',
  out: '#3b82f6',
  problem: '#f59e0b',
}

function Thing({ x, kind, tone, y }: { x: number; y: number; kind: 'kit' | 'item'; tone: keyof typeof TONE_COLOR }) {
  const size: [number, number, number] = kind === 'kit' ? [0.32, 0.26, 0.38] : [0.18, 0.16, 0.18]
  return (
    <mesh position={[x, y + size[1] / 2, 0]} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={kind === 'item' && tone === 'home' ? '#a1a1aa' : TONE_COLOR[tone]}
        transparent={tone === 'out'}
        opacity={tone === 'out' ? 0.3 : 1}
        wireframe={tone === 'out'}
      />
    </mesh>
  )
}

/**
 * ป้ายชื่อลอยเหนือชั้นวาง — วาดตัวอักษรลง canvas แล้วทำเป็น sprite (หันหาจอเสมอ)
 * ไม่ใช้ drei <Html> เพราะมันสร้าง React root แยกต่อป้ายแล้ว unmount ระหว่าง render
 * ("Attempted to synchronously unmount a root…") ทำให้ฉากค้างไม่อัปเดตบางจังหวะ
 */
function Label({ text, y, selected }: { text: string; y: number; selected: boolean }) {
  const { texture, aspect } = useMemo(() => {
    const font = 'bold 64px "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif'
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')!
    ctx.font = font
    const pad = 28
    c.width = Math.ceil(ctx.measureText(text).width) + pad * 2
    c.height = 96
    ctx.font = font // เปลี่ยนขนาด canvas แล้ว context รีเซ็ต — ตั้งฟอนต์ใหม่
    ctx.fillStyle = selected ? '#7c3aed' : 'rgba(255,255,255,0.95)'
    ctx.beginPath()
    ctx.roundRect(0, 0, c.width, c.height, 20)
    ctx.fill()
    ctx.fillStyle = selected ? '#ffffff' : '#27272a'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, c.width / 2, c.height / 2 + 4)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return { texture: t, aspect: c.width / c.height }
  }, [text, selected])
  useEffect(() => () => texture.dispose(), [texture])
  const h = 0.22
  return (
    <sprite position={[0, y, 0]} scale={[h * aspect, h, 1]} renderOrder={10}>
      <spriteMaterial map={texture} depthTest={false} transparent />
    </sprite>
  )
}

/** ชั้นวางหนึ่งตู้ — โครง + แผ่นชั้น + กล่องแทนของบนแต่ละระดับ (จุดกำเนิด = กลางฐาน) */
export function RackModel({
  rack,
  selected = false,
  highlightLevelId,
  onSelect,
  onDrag,
  showLabel = true,
}: {
  rack: Pick<RoomRack, 'id' | 'code' | 'width' | 'levels'>
  selected?: boolean
  highlightLevelId?: string
  onSelect?: (id: string) => void
  /** ลากชั้นวาง (ผู้จัดการ) — กด / ขยับ / ปล่อย */
  onDrag?: (phase: 'down' | 'move' | 'up', id: string, e: ThreeEvent<PointerEvent>) => void
  showLabel?: boolean
}) {
  const [hover, setHover] = useState(false)
  const w = rack.width - 0.15
  const n = Math.max(rack.levels.length, 1)
  const height = n * LEVEL_H + BOARD
  const frame = selected ? '#7c3aed' : hover ? '#71717a' : '#52525b'

  return (
    <group
      onPointerDown={e => {
        if (!onDrag) return
        e.stopPropagation()
        // จับเมาส์ไว้กับตู้นี้ — move/up ถัดไปมาที่ตู้นี้แม้เมาส์หลุดออกนอกตู้
        ;(e.target as unknown as Element).setPointerCapture(e.pointerId)
        onDrag('down', rack.id, e)
      }}
      onPointerMove={e => {
        if (onDrag) onDrag('move', rack.id, e)
      }}
      onPointerUp={e => {
        if (!onDrag) return
        ;(e.target as unknown as Element).releasePointerCapture(e.pointerId)
        onDrag('up', rack.id, e)
      }}
      onClick={e => {
        if (!onSelect) return
        e.stopPropagation()
        onSelect(rack.id)
      }}
      onPointerOver={e => {
        if (!onSelect) return
        e.stopPropagation()
        setHover(true)
        document.body.style.cursor = onDrag ? 'grab' : 'pointer'
      }}
      onPointerOut={() => {
        setHover(false)
        document.body.style.cursor = ''
      }}
    >
      {/* กล่องโปร่งใสครอบทั้งตู้ — ให้กด/ลากโดนตรงไหนของตู้ก็ได้ (โครงจริงมีแค่เสาบางๆ กับแผ่นชั้น) */}
      {onSelect && (
        <mesh position={[0, height / 2, 0]}>
          <boxGeometry args={[w, height, RACK_DEPTH]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {/* เสา 4 มุม */}
      {[-1, 1].flatMap(sx =>
        [-1, 1].map(sz => (
          <mesh key={`${sx}${sz}`} position={[(sx * w) / 2, height / 2, (sz * RACK_DEPTH) / 2]}>
            <boxGeometry args={[POST, height, POST]} />
            <meshStandardMaterial color={frame} />
          </mesh>
        ))
      )}
      {/* แผ่นชั้น (ฐาน + ทุกระดับ) และของบนแต่ละระดับ */}
      {Array.from({ length: n + 1 }, (_, i) => {
        const lv = rack.levels[i]
        const lit = !!lv && lv.id === highlightLevelId
        const y = i * LEVEL_H
        const things = lv?.things ?? []
        // ponytail: วางของเรียงแถวเดียวตามความกว้าง — ของเกินที่ว่างไม่แสดง (ดูครบในหน้าระดับชั้น)
        const slots = Math.max(1, Math.floor(w / 0.4))
        const shown = things.slice(0, slots)
        const step = w / slots
        return (
          <group key={i}>
            <mesh position={[0, y + BOARD / 2, 0]} receiveShadow>
              <boxGeometry args={[w, BOARD, RACK_DEPTH]} />
              <meshStandardMaterial color={lit ? '#a78bfa' : selected ? '#c4b5fd' : '#d4d4d8'} />
            </mesh>
            {i < n &&
              shown.map((t, k) => (
                <Thing key={t.id} kind={t.kind} tone={t.tone} x={-w / 2 + step * (k + 0.5)} y={y + BOARD} />
              ))}
          </group>
        )
      })}
      {showLabel && <Label text={rack.code} y={height + 0.25} selected={selected} />}
    </group>
  )
}

type Drag = { id: string; x: number; y: number; ox: number; oz: number; moved: boolean }

const FLOOR = new Plane(new Vector3(0, 1, 0), 0)
/** จุดบนพื้น (y = 0) ใต้เมาส์ — จากแนวสายตา ไม่ใช่จุดที่โดนวัตถุ */
const floorPoint = (e: ThreeEvent<PointerEvent>) => e.ray.intersectPlane(FLOOR, new Vector3())

/** ห้องทั้งห้อง — หมุน/ซูมได้ กดชั้นวางเพื่อเลือก กดพื้นว่างเพื่อยกเลิก · มี onMove = ลากชั้นวางย้ายตำแหน่งได้ */
export default function RoomScene({
  room,
  selectedId,
  onSelect,
  onMove,
}: {
  room: RoomData
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** ผู้จัดการเท่านั้น — คืน Promise ให้ค้างตำแหน่งใหม่ไว้จนบันทึกเสร็จ (ไม่กระโดดกลับก่อน refresh) */
  onMove?: (id: string, x: number, y: number) => Promise<unknown>
}) {
  const span = Math.max(room.width, room.depth)
  // ลากอยู่: ช่องใหม่ + ระยะจากจุดที่กดถึงกลางตู้ (ตู้ไม่กระโดดตอนเริ่มลาก)
  // ref = ค่าล่าสุดเสมอ (event มาถี่กว่ารอบ render) · state = ให้ฉากวาดใหม่
  const dragRef = useRef<Drag | null>(null)
  const [drag, setDragState] = useState<Drag | null>(null)
  const controls = useRef<OrbitControlsImpl>(null)
  const setDrag = (d: Drag | null) => {
    dragRef.current = d
    setDragState(d)
    // ปิดการหมุนกล้องทันทีที่จับตู้ (prop enabled อัปเดตช้ากว่า 1 render — กล้องจะหมุนตามตอนเริ่มลาก)
    if (controls.current) controls.current.enabled = !d
  }

  const onDrag = async (phase: 'down' | 'move' | 'up', id: string, e: ThreeEvent<PointerEvent>) => {
    const r = room.racks.find(r => r.id === id)
    const p = floorPoint(e)
    if (!r || !p) return
    const { w, d } = footprint(r)
    const cur = dragRef.current

    if (phase === 'down') {
      onSelect(id)
      setDrag({ id, x: r.x, y: r.y, ox: p.x - (r.x + w / 2), oz: p.z - (r.y + d / 2), moved: false })
      return
    }
    if (!cur || cur.id !== id) return
    // ตำแหน่งช่องใต้เมาส์ตอนนี้ — คิดทั้งตอนขยับและตอนปล่อย (บางเครื่องส่ง move มาน้อย/ไม่ส่งเลยก่อนปล่อย)
    const placed = clampToRoom({ ...r, x: Math.round(p.x - cur.ox - w / 2), y: Math.round(p.z - cur.oz - d / 2) }, room)
    const next = placed.x !== cur.x || placed.y !== cur.y ? { ...cur, x: placed.x, y: placed.y, moved: true } : cur
    if (phase === 'move') {
      if (next !== cur) setDrag(next)
      return
    }
    // ปล่อย — ย้ายจริงค่อยบันทึก; ค้างตำแหน่งใหม่ไว้จนบันทึกเสร็จ
    if (next !== cur) setDrag(next)
    if (next.moved && onMove) await onMove(id, next.x, next.y)
    setDrag(null)
  }

  // ปล่อยเมาส์นอกจอ (pointer capture หลุด) = ยกเลิกการลากที่ยังไม่ได้ขยับ
  useEffect(() => {
    if (!drag || drag.moved) return
    const cancel = () => {
      if (dragRef.current && !dragRef.current.moved) setDrag(null)
    }
    window.addEventListener('pointerup', cancel)
    return () => window.removeEventListener('pointerup', cancel)
  }, [drag])

  return (
    <Canvas
      shadows
      camera={{ position: [room.width / 2 + span * 0.2, span * 0.9, room.depth + span * 0.6], fov: 45 }}
      onPointerMissed={() => {
        if (!dragRef.current) onSelect(null)
      }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[span, span * 1.5, span]} intensity={1.1} castShadow />

      {/* พื้นห้อง + เส้นช่องตาราง */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[room.width / 2, -0.001, room.depth / 2]} receiveShadow>
        <planeGeometry args={[room.width, room.depth]} />
        <meshStandardMaterial color="#f4f4f5" />
      </mesh>
      <Grid
        position={[room.width / 2, 0.001, room.depth / 2]}
        args={[room.width, room.depth]}
        cellSize={1}
        cellColor="#d4d4d8"
        sectionSize={0}
        fadeDistance={span * 4}
      />

      {room.racks.map(r => {
        const at = drag?.id === r.id ? { ...r, x: drag.x, y: drag.y } : r
        const { w, d } = footprint(at)
        return (
          <group key={r.id} position={[at.x + w / 2, 0, at.y + d / 2]} rotation={[0, (-r.rotation * Math.PI) / 180, 0]}>
            <RackModel rack={r} selected={r.id === selectedId} onSelect={onSelect} onDrag={onMove ? onDrag : undefined} />
          </group>
        )
      })}

      <OrbitControls
        ref={controls}
        makeDefault
        enabled={!drag}
        target={[room.width / 2, 0.5, room.depth / 2]}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={2}
        maxDistance={span * 3}
        enableDamping
      />
    </Canvas>
  )
}

/** ชั้นวางตู้เดียวขนาดเล็ก ไฮไลต์ระดับที่สแกน — หน้าระดับชั้นบนมือถือ */
export function RackMini({ rack, highlightLevelId }: { rack: Pick<RoomRack, 'id' | 'code' | 'width' | 'levels'>; highlightLevelId: string }) {
  const h = rack.levels.length * LEVEL_H
  return (
    <Canvas camera={{ position: [rack.width * 0.9, h * 0.9 + 0.6, 2.4], fov: 40 }}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[2, 4, 3]} intensity={1} />
      <RackModel rack={rack} highlightLevelId={highlightLevelId} showLabel={false} />
      <OrbitControls target={[0, h / 2, 0]} enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.6} />
    </Canvas>
  )
}
