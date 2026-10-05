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

// --- ประตูทางเข้า — แค่หมุดบอกว่าอยู่ผนังด้านไหน ช่องที่เท่าไร (ไม่กั้นพื้นที่วางชั้นวาง) -------------
// back = ผนัง y 0 (ด้านบนของผัง) · front = ผนัง y depth (ด้านล่าง = ด้านหน้า) · left = x 0 · right = x width

export const DOOR_SIDES = ['front', 'back', 'left', 'right'] as const
export type DoorSide = (typeof DOOR_SIDES)[number]
export interface Door {
  side: DoorSide
  /** ช่องบนผนังด้านนั้น เริ่ม 0 — front/back นับจากซ้าย, left/right นับจากหลัง */
  pos: number
}

/** ความยาวผนังด้านนั้นเป็นช่อง */
export const wallLength = (room: { width: number; depth: number }, side: DoorSide) =>
  side === 'left' || side === 'right' ? room.depth : room.width

/** ดึงประตูให้อยู่บนผนังเสมอ (ห้องถูกย่อ / ค่าเพี้ยน) */
export function clampDoor(room: { width: number; depth: number }, door: Door): Door {
  const n = Math.trunc(Number(door.pos))
  return { side: door.side, pos: Math.max(0, Math.min(Number.isFinite(n) ? n : 0, wallLength(room, door.side) - 1)) }
}

/** กลางประตูในหน่วยโลก 3D (x, z) + มุมหมุนรอบแกน Y ให้แนบผนัง — ประตูกว้าง 1 ช่อง */
export function doorPlacement(room: { width: number; depth: number }, door: Door): { x: number; z: number; rotation: number } {
  const p = clampDoor(room, door).pos + 0.5
  switch (door.side) {
    case 'back':
      return { x: p, z: 0, rotation: 0 }
    case 'front':
      return { x: p, z: room.depth, rotation: 0 }
    case 'left':
      return { x: 0, z: p, rotation: Math.PI / 2 }
    case 'right':
      return { x: room.width, z: p, rotation: Math.PI / 2 }
  }
}

// --- มุมกล้อง 3D (ภาพรวมห้อง / focus ชั้นวาง / focus ระดับชั้น) -----------------------
// หน่วยโลก 3D: 1 = 1 ช่องบนผัง · X = ซ้าย→ขวา, Z = หน้า→หลัง (y บนผัง), Y = ความสูง

/** ความสูงของหนึ่งระดับชั้น และความลึกของตู้ ในหน่วยโลก 3D (ฉาก 3D ใช้ค่าเดียวกัน) */
export const LEVEL_H = 0.45
export const RACK_DEPTH = 0.6
/** มุมมองแนวตั้งของกล้อง (องศา) */
export const CAMERA_FOV = 45

export type Vec3 = [number, number, number]
export interface CameraView {
  pos: Vec3
  target: Vec3
}

/** ระยะกล้องที่เห็นกรอบครึ่งกว้าง × ครึ่งสูง พอดีจอ — จอแคบ (aspect < 1) ต้องถอยไกลขึ้น */
function fitDistance(halfW: number, halfH: number, aspect: number): number {
  const t = Math.tan((CAMERA_FOV * Math.PI) / 360)
  return Math.max(halfH / t, halfW / (t * Math.max(aspect, 0.1)))
}

function along(from: Vec3, dir: Vec3, dist: number): Vec3 {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1
  return [from[0] + (dir[0] / len) * dist, from[1] + (dir[1] / len) * dist, from[2] + (dir[2] / len) * dist]
}

/**
 * ตำแหน่งกล้อง + จุดที่มอง
 * - ไม่มี rack = ภาพรวมทั้งห้อง (มองเฉียงลงจากด้านหน้า)
 * - มี rack = focus ตู้นั้นทั้งตู้ จากด้านที่หันเข้าหากลางห้อง (กล้องไม่ไปอยู่นอกผนัง)
 * - มี level (1 = ล่างสุด) = ซูมเข้าระดับนั้น
 */
export function cameraView(
  room: { width: number; depth: number },
  rack: { x: number; y: number; rotation: Rotation; width: number; levels: number } | null,
  level: number | null,
  aspect: number
): CameraView {
  if (!rack) {
    const target: Vec3 = [room.width / 2, 0.5, room.depth / 2]
    const dist = fitDistance(room.width / 2 + 0.8, room.depth * 0.3 + 1.5, aspect) + room.depth * 0.45
    return { pos: along(target, [0.2, 0.75, 1], dist), target }
  }

  const { w, d } = footprint(rack)
  const cx = rack.x + w / 2
  const cz = rack.y + d / 2
  // หน้าตู้ = แกน Z ของตู้หลังหมุน — เลือกด้านที่หันเข้าหากลางห้อง
  const th = (-rack.rotation * Math.PI) / 180
  let fx = Math.sin(th)
  let fz = Math.cos(th)
  if (fx * (room.width / 2 - cx) + fz * (room.depth / 2 - cz) < 0) {
    fx = -fx
    fz = -fz
  }
  // เยื้องด้านข้างเล็กน้อยให้เห็นความลึก
  const sx = fz
  const sz = -fx
  const halfW = rack.width / 2 + 0.5

  if (level == null) {
    const h = Math.max(rack.levels, 1) * LEVEL_H
    const target: Vec3 = [cx, h / 2, cz]
    // เผื่อที่ด้านบนให้ป้ายรหัสตู้ไม่ชนแถบเลือกมุมมอง
    const dist = fitDistance(halfW, h / 2 + 0.6, aspect) + RACK_DEPTH / 2
    return { pos: along(target, [fx + sx * 0.25, 0.3, fz + sz * 0.25], dist), target }
  }
  const target: Vec3 = [cx, (level - 1) * LEVEL_H + LEVEL_H / 2, cz]
  // เห็นระดับที่ focus เต็มๆ กับระดับบน-ล่างบางส่วน
  const dist = fitDistance(halfW, LEVEL_H * 1.6, aspect) + RACK_DEPTH / 2
  return { pos: along(target, [fx + sx * 0.15, 0.4, fz + sz * 0.15], dist), target }
}

// --- แผ่นพิมพ์ QR ของทั้งห้อง (A4 แนวตั้ง) — หน่วย mm ---------------------------------

export const A4 = { w: 210, h: 297 }
/** ขนาด QR ที่ตั้งได้ (mm) — ใหญ่สุดคือเท่าที่ยังลงกระดาษได้หนึ่งป้ายพร้อมขอบ */
export const QR_SIZE = { min: 15, max: 150, default: 40 }
/** ขอบกระดาษ / ช่องไฟระหว่างป้าย / ขอบในป้าย */
const SHEET_MARGIN = 10
const LABEL_GAP = 3
const LABEL_PAD = 3

export interface QrSheetLayout {
  /** ขนาด QR ที่ใช้จริง (ปัดและบีบให้อยู่ในช่วงที่ตั้งได้) */
  qr: number
  cols: number
  rows: number
  perPage: number
  labelW: number
  labelH: number
  /** ความสูงของข้อความใต้ QR (รหัสชั้น + ชื่อห้อง) — โตตามขนาด QR */
  textH: number
  margin: number
  gap: number
  pad: number
}

/** จัดป้าย QR ขนาด qr มม. ลง A4 แนวตั้ง: ได้กี่คอลัมน์ × กี่แถวต่อหน้า (อย่างน้อย 1 ป้าย) */
export function qrSheetLayout(qrMm: number): QrSheetLayout {
  const qr = Math.min(QR_SIZE.max, Math.max(QR_SIZE.min, Math.round(Number.isFinite(qrMm) ? qrMm : QR_SIZE.default)))
  const textH = Math.max(7, Math.round(qr * 0.22))
  const labelW = qr + LABEL_PAD * 2
  const labelH = qr + LABEL_PAD * 2 + textH
  const cols = Math.max(1, Math.floor((A4.w - SHEET_MARGIN * 2 + LABEL_GAP) / (labelW + LABEL_GAP)))
  const rows = Math.max(1, Math.floor((A4.h - SHEET_MARGIN * 2 + LABEL_GAP) / (labelH + LABEL_GAP)))
  return { qr, cols, rows, perPage: cols * rows, labelW, labelH, textH, margin: SHEET_MARGIN, gap: LABEL_GAP, pad: LABEL_PAD }
}

/** แบ่งรายการเป็นหน้า หน้าละ perPage */
export function paginate<T>(items: T[], perPage: number): T[][] {
  const size = Math.max(1, perPage)
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size))
  return pages
}
