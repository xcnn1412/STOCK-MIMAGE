// ตรรกะล้วนของวัสดุสิ้นเปลือง (ไม่แตะฐานข้อมูล) — เทสต์ที่ consumable-logic.check.ts
// ยอดคงเหลือ (items.quantity) = บนชั้น + ในกระเป๋า · จำนวนประจำกระเป๋า = kit_contents.quantity

/** จำนวนสูงสุดที่กรอกได้ต่อครั้ง */
export const MAX_QTY = 100_000

/** เหลือบนชั้น = ยอดคงเหลือ − ผลรวมจำนวนประจำกระเป๋า (ไม่ต่ำกว่า 0) */
export const onShelf = (total: number, inKits: number) => Math.max(0, total - inKits)

/** ขาด = ผลรวมจำนวนประจำกระเป๋าที่ยอดคงเหลือไม่พอ (กระเป๋าเติมไม่ครบ) */
export const shortage = (total: number, inKits: number) => Math.max(0, inKits - total)

export type StockLevel = 'out' | 'low' | 'ok'

/**
 * ระดับสต็อก: out = ยอดหมด · low = ขาด หรือ (ตั้งขั้นต่ำ และ เหลือบนชั้น ≤ ขั้นต่ำ) · ok = ที่เหลือ
 * ใกล้หมดเทียบกับ "เหลือบนชั้น" ไม่ใช่ยอดรวม
 */
export function stockLevel(total: number, inKits: number, min: number | null): StockLevel {
  if (total <= 0) return 'out'
  if (shortage(total, inKits) > 0) return 'low'
  if (min != null && onShelf(total, inKits) <= min) return 'low'
  return 'ok'
}

/** จำนวนเต็ม 0–MAX_QTY จากช่องกรอก (string/number) — ไม่ผ่าน = null */
export function parseCount(raw: unknown): number | null {
  const s = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : ''
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return n <= MAX_QTY ? n : null
}

/** จำนวนที่เติม/เบิก/ตัดทิ้ง: จำนวนเต็ม 1–MAX_QTY — ไม่ผ่าน = null */
export function parseQty(raw: unknown): number | null {
  const n = parseCount(raw)
  return n != null && n >= 1 ? n : null
}

/**
 * ช่องวัสดุสิ้นเปลืองจากฟอร์มอุปกรณ์: unit, min_quantity (ว่าง = ไม่เตือน), quantity = ยอดตั้งต้น (เฉพาะตอนสร้าง, ว่าง = 0)
 */
export function parseConsumableFields(
  form: { get(name: string): unknown },
  withInitial: boolean
): { error: string } | { unit: string | null; min_quantity: number | null; initial: number } {
  const text = (k: string) => (typeof form.get(k) === 'string' ? (form.get(k) as string).trim() : '')
  const minRaw = text('min_quantity')
  const min_quantity = minRaw === '' ? null : parseCount(minRaw)
  if (min_quantity == null && minRaw !== '') return { error: `จำนวนขั้นต่ำต้องเป็นจำนวนเต็ม 0–${MAX_QTY.toLocaleString()}` }
  const qtyRaw = withInitial ? text('quantity') : ''
  const initial = qtyRaw === '' ? 0 : parseCount(qtyRaw)
  if (initial == null) return { error: `จำนวนตั้งต้นต้องเป็นจำนวนเต็ม 0–${MAX_QTY.toLocaleString()}` }
  return { unit: text('unit') || null, min_quantity, initial }
}

/** ปรับยอดจากการนับบนชั้น: ยอดใหม่ = ที่นับได้บนชั้น + ที่อยู่ในกระเป๋า */
export const totalFromShelfCount = (counted: number, inKits: number) => counted + inKits

export type PackItem = { id?: string; name?: string; status: string; is_consumable?: boolean | null }
export type BlockedItem = { id: string; name: string; status: string }
export type PackState = { total: number; out: number; packed: boolean; blocked: BlockedItem[] }

/**
 * สถานะการจัดกระเป๋า — ดูเฉพาะอุปกรณ์ปกติ (ไม่นับวัสดุสิ้นเปลือง)
 * blocked = ชิ้นที่นำออกไม่ได้ (สถานะไม่ใช่ available / in_use เช่น เสีย ซ่อม หาย)
 * total = ชิ้นที่นำออกได้ (available + in_use) · out = ชิ้นที่ in_use
 * packed ("จัดครบ") = total > 0 และนำออกครบทุกชิ้นที่นำออกได้
 */
export function packState(items: PackItem[]): PackState {
  const regular = items.filter(i => !i.is_consumable)
  const usable = regular.filter(i => i.status === 'available' || i.status === 'in_use')
  const blocked = regular
    .filter(i => i.status !== 'available' && i.status !== 'in_use')
    .map(i => ({ id: i.id ?? '', name: i.name ?? '', status: i.status }))
  const total = usable.length
  const out = usable.filter(i => i.status === 'in_use').length
  return { total, out, packed: total > 0 && out === total, blocked }
}

/** กระเป๋า "จัดครบ" — ดู packState */
export function isPacked(items: PackItem[]): boolean {
  return packState(items).packed
}

export interface UsePair {
  kitId: string
  itemId: string
}
export type UseCut = UsePair & { used: number }

const pairKey = (p: UsePair) => `${p.kitId}:${p.itemId}`

/**
 * ตรวจจำนวน "ใช้ไป" ตอนปิดงาน → รายการที่ต้องตัดยอด
 * kitContents = คู่ (กระเป๋า, วัสดุสิ้นเปลือง) ในกระเป๋าที่งานนี้จอง · alreadyCut = คู่ที่งานนี้ตัดไปแล้ว
 * error: คู่ไม่อยู่ในกระเป๋าที่จอง / จำนวนไม่ใช่จำนวนเต็ม ≥ 0 / คู่ซ้ำ · ข้ามคู่ที่ตัดแล้วและ used = 0
 */
export function planReturnUse(
  kitContents: UsePair[],
  input: UseCut[],
  alreadyCut: UsePair[]
): { error: string } | { cuts: UseCut[] } {
  const allowed = new Set(kitContents.map(pairKey))
  const done = new Set(alreadyCut.map(pairKey))
  const seen = new Set<string>()
  const cuts: UseCut[] = []
  for (const row of input) {
    const key = pairKey(row)
    if (!allowed.has(key)) return { error: 'มีวัสดุสิ้นเปลืองที่ไม่อยู่ในกระเป๋าของงานนี้' }
    if (!Number.isInteger(row.used) || row.used < 0 || row.used > MAX_QTY) {
      return { error: 'จำนวนที่ใช้ไปต้องเป็นจำนวนเต็มตั้งแต่ 0' }
    }
    if (seen.has(key)) return { error: 'มีรายการใช้ไปซ้ำกัน' }
    seen.add(key)
    if (row.used === 0 || done.has(key)) continue
    cuts.push({ kitId: row.kitId, itemId: row.itemId, used: row.used })
  }
  return { cuts }
}
