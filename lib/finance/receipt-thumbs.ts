// ============================================================================
// รูปย่อของไฟล์แนบใบเบิก — ไฟล์ <ชื่อเดิมไม่รวมนามสกุล>_thumb.jpg อยู่ข้างไฟล์เดิมในบัคเก็ต receipts
// ไฟล์กติกาล้วน: ไม่ import next/*, supabase หรือ react — ใช้ได้ทั้ง server, client และในชุดตรวจ
//
// ฝั่ง browser ทำรูปย่อด้วย compressImage(file, THUMB_MAX_MB, THUMB_MAX_DIMENSION) (lib/utils.ts) แล้วส่งคู่กับไฟล์เดิม
// server อัปโหลดรูปย่อไปที่ thumbPathFor(path ของไฟล์เดิม) · ไฟล์เก่าที่ยังไม่มีรูปย่อ: หน้าจอกลับไปใช้ไฟล์เดิมเมื่อโหลดรูปย่อไม่ได้
// รูปย่อของใบที่ถูกลบ/ซ่อนยังไม่ถูกลบในขั้นนี้ (ไฟล์กำพร้าเก็บกวาดด้วย scripts/cleanup-storage.mjs)
// ตรวจด้วย:  npx tsx lib/finance/receipt-thumbs.check.ts
// ============================================================================

/** ท้ายชื่อไฟล์รูปย่อ (แทนนามสกุลเดิม) */
export const THUMB_SUFFIX = '_thumb.jpg'
/** ด้านยาวสุดของรูปย่อ (px) */
export const THUMB_MAX_DIMENSION = 320
/** ขนาดเป้าหมายของรูปย่อ (MB) — อาร์กิวเมนต์ที่สองของ compressImage */
export const THUMB_MAX_MB = 0.3

/** path สาธารณะของบัคเก็ต receipts — รูปย่อมีเฉพาะไฟล์ในบัคเก็ตนี้ */
const RECEIPTS_PATH = '/storage/v1/object/public/receipts/'

/**
 * path ของรูปย่อในบัคเก็ตจาก path ของไฟล์เดิม: นามสกุลของชื่อไฟล์ (ส่วนสุดท้าย) ถูกแทนด้วย _thumb.jpg
 * 'claims/EXP-1/1_0.jpg' → 'claims/EXP-1/1_0_thumb.jpg' · ไม่มีนามสกุล = ต่อท้าย · path ที่เป็นรูปย่ออยู่แล้วคืนเดิม
 */
export function thumbPathFor(path: string): string {
  if (path.endsWith(THUMB_SUFFIX)) return path
  const slash = path.lastIndexOf('/')
  const name = path.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  return `${path.slice(0, slash + 1)}${stem}${THUMB_SUFFIX}`
}

/** origin ของสตอเรจของระบบ (ตั้งไว้ = ต้องเป็น host เดียวกัน) · ไม่ได้ตั้ง = ดูเฉพาะ path */
function ownStorage(): URL | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  try {
    return new URL(base)
  } catch {
    return null
  }
}

/**
 * URL รูปย่อของไฟล์แนบ — null เมื่อไม่มีรูปย่อให้ใช้:
 * ไฟล์ .pdf · URL ที่ไม่อยู่ใต้ /storage/v1/object/public/receipts/ (หรืออยู่คนละ host กับ NEXT_PUBLIC_SUPABASE_URL เมื่อตั้งไว้)
 * · URL ที่เป็นรูปย่ออยู่แล้ว · ข้อความที่ไม่ใช่ URL http(s)
 * ?query / #hash ของ URL เดิมต่อท้ายให้เหมือนเดิม · หน้าจอใช้ `thumbUrlFor(url) ?? url` และกลับไปใช้ url เมื่อโหลดรูปย่อไม่ได้
 */
export function thumbUrlFor(url: string): string | null {
  if (typeof url !== 'string' || !url) return null
  const cut = url.search(/[?#]/)
  const base = cut < 0 ? url : url.slice(0, cut)
  const rest = cut < 0 ? '' : url.slice(cut)
  let parsed: URL
  try {
    parsed = new URL(base)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  if (parsed.username || parsed.password) return null
  const own = ownStorage()
  if (own && (parsed.protocol !== own.protocol || parsed.host !== own.host)) return null
  const { pathname } = parsed
  if (!pathname.startsWith(RECEIPTS_PATH) || pathname.length <= RECEIPTS_PATH.length || pathname.endsWith('/')) return null
  const lower = pathname.toLowerCase()
  if (lower.endsWith('.pdf') || lower.endsWith(THUMB_SUFFIX)) return null
  // แทนที่บนข้อความเดิม (ไม่ใช่ pathname ที่ถูกแปลง) — ชื่อไฟล์ที่เข้ารหัสไว้คงรูปเดิม
  const slash = base.lastIndexOf('/')
  return `${base.slice(0, slash + 1)}${thumbPathFor(base.slice(slash + 1))}${rest}`
}
