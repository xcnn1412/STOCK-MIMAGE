// ตรรกะล้วนของผังห้อง (ไม่แตะฐานข้อมูล) — เทสต์ที่ room-logic.check.ts
// พิกัดเป็นช่องตาราง: x = ซ้าย→ขวา (0..room.width-1), y = หน้า→หลัง (0..room.depth-1)

export type Rotation = 0 | 90 | 180 | 270

export interface RackPlacement {
  id: string
  x: number
  y: number
  rotation: Rotation
  /** ความกว้างของชั้นวางเป็นช่อง (ด้านยาว) — ลึก 1 ช่องเสมอ */
  width: number
}

/** ขนาดที่ชั้นวางกินบนผัง — หมุน 90/270 = ด้านยาวไปทางลึก */
export function footprint(r: { rotation: Rotation; width: number }): { w: number; d: number } {
  return r.rotation === 90 || r.rotation === 270 ? { w: 1, d: r.width } : { w: r.width, d: 1 }
}

/** ขยับตำแหน่งให้ชั้นวางอยู่ในห้องทั้งตู้ */
export function clampToRoom<T extends RackPlacement>(r: T, room: { width: number; depth: number }): T {
  const { w, d } = footprint(r)
  return {
    ...r,
    x: Math.max(0, Math.min(r.x, room.width - w)),
    y: Math.max(0, Math.min(r.y, room.depth - d)),
  }
}

/** ช่องที่ชั้นวางนี้กิน — "x,y" */
export function cellsOf(r: RackPlacement): string[] {
  const { w, d } = footprint(r)
  const out: string[] = []
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push(`${r.x + i},${r.y + j}`)
  return out
}

/** ชั้นวางที่ทับกับชั้นวางอื่น (id) — ใช้เตือนบนผัง ไม่บล็อก */
export function overlapping(racks: RackPlacement[]): Set<string> {
  const owner = new Map<string, string>()
  const out = new Set<string>()
  for (const r of racks) {
    for (const c of cellsOf(r)) {
      const other = owner.get(c)
      if (other && other !== r.id) {
        out.add(other)
        out.add(r.id)
      } else owner.set(c, r.id)
    }
  }
  return out
}

/** ช่องว่างแรก (ไล่จากหน้าซ้าย) ที่วางชั้นวางกว้าง width แนวนอนได้ — ไม่มีที่ว่าง = มุมซ้ายหน้า */
export function firstFreeSpot(
  room: { width: number; depth: number },
  racks: RackPlacement[],
  width: number
): { x: number; y: number } {
  const taken = new Set(racks.flatMap(cellsOf))
  for (let y = 0; y < room.depth; y++) {
    for (let x = 0; x + width <= room.width; x++) {
      const cells = Array.from({ length: width }, (_, i) => `${x + i},${y}`)
      if (cells.every(c => !taken.has(c))) return { x, y }
    }
  }
  return { x: 0, y: 0 }
}

/** รหัสของระดับชั้น เช่น ชั้นวาง A ระดับ 2 → "A-2" (ใช้เป็นรหัสบน QR) */
export const levelCode = (rackCode: string, level: number) => `${rackCode}-${level}`

export const nextRotation = (r: Rotation): Rotation => ((r + 90) % 360) as Rotation
