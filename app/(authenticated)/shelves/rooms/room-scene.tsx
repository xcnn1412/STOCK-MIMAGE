'use client'

// ฉาก 3D ของห้องเก็บของ (three.js ผ่าน @react-three/fiber) — โหลดผ่าน next/dynamic ssr:false เท่านั้น
// หน่วย: 1 = 1 ช่องบนผัง · แกน X = ซ้าย→ขวา (x บนผัง), แกน Z = หน้า→หลัง (y บนผัง), แกน Y = ความสูง

import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Grid, Html, OrbitControls } from '@react-three/drei'
import { footprint } from '../room-logic'
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

/** ชั้นวางหนึ่งตู้ — โครง + แผ่นชั้น + กล่องแทนของบนแต่ละระดับ (จุดกำเนิด = กลางฐาน) */
export function RackModel({
  rack,
  selected = false,
  highlightLevelId,
  onSelect,
  showLabel = true,
}: {
  rack: Pick<RoomRack, 'id' | 'code' | 'width' | 'levels'>
  selected?: boolean
  highlightLevelId?: string
  onSelect?: (id: string) => void
  showLabel?: boolean
}) {
  const [hover, setHover] = useState(false)
  const w = rack.width - 0.15
  const n = Math.max(rack.levels.length, 1)
  const height = n * LEVEL_H + BOARD
  const frame = selected ? '#7c3aed' : hover ? '#71717a' : '#52525b'

  return (
    <group
      onClick={e => {
        if (!onSelect) return
        e.stopPropagation()
        onSelect(rack.id)
      }}
      onPointerOver={e => {
        if (!onSelect) return
        e.stopPropagation()
        setHover(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHover(false)
        document.body.style.cursor = ''
      }}
    >
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
      {showLabel && (
        <Html position={[0, height + 0.25, 0]} center style={{ pointerEvents: 'none' }}>
          <div
            className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-bold shadow ${
              selected ? 'bg-violet-600 text-white' : 'bg-white/90 text-zinc-800'
            }`}
          >
            {rack.code}
          </div>
        </Html>
      )}
    </group>
  )
}

/** ห้องทั้งห้อง — หมุน/ซูมได้ กดชั้นวางเพื่อเลือก กดพื้นว่างเพื่อยกเลิก */
export default function RoomScene({
  room,
  selectedId,
  onSelect,
}: {
  room: RoomData
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const span = Math.max(room.width, room.depth)
  return (
    <Canvas
      shadows
      camera={{ position: [room.width / 2 + span * 0.2, span * 0.9, room.depth + span * 0.6], fov: 45 }}
      onPointerMissed={() => onSelect(null)}
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
        const { w, d } = footprint(r)
        return (
          <group key={r.id} position={[r.x + w / 2, 0, r.y + d / 2]} rotation={[0, (-r.rotation * Math.PI) / 180, 0]}>
            <RackModel rack={r} selected={r.id === selectedId} onSelect={onSelect} />
          </group>
        )
      })}

      <OrbitControls
        makeDefault
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
