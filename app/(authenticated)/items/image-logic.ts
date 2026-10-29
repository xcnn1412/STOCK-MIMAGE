/** กติการูปอุปกรณ์ (ฟังก์ชันบริสุทธิ์ — ใช้ใน server action และชุดตรวจ scripts/items-access.check.ts) */

/** ชนิดไฟล์รูปที่รับอัปโหลด */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
/** ขนาดสูงสุดต่อไฟล์ (5MB) */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const IMAGE_RULE_ERROR = 'รองรับเฉพาะ JPG/PNG/WebP ไม่เกิน 5MB'

/** แปลง items.image_url (JSON array หรือ URL เดี่ยว) เป็นรายการ URL · ว่าง/อ่านไม่ได้ = [] */
export function parseImageUrls(imageUrl: string | null | undefined): string[] {
  if (!imageUrl) return []
  if (imageUrl.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(imageUrl)
      return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string' && u !== '') : []
    } catch {
      return []
    }
  }
  return [imageUrl]
}

/**
 * existing_images จากฟอร์ม (JSON string หรือ array) → เก็บเฉพาะ URL ที่อยู่ใน image_url เดิมของอุปกรณ์นี้
 * กันการแอบผูกรูปของคนอื่น/URL ภายนอก · ค่าที่อ่านไม่ได้ = [] (กรองทิ้ง ไม่ error)
 */
export function keepOwnImages(existing: unknown, currentImageUrl: string | null | undefined): string[] {
  let list: unknown = existing
  if (typeof existing === 'string') {
    try {
      list = existing ? JSON.parse(existing) : []
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const own = new Set(parseImageUrls(currentImageUrl))
  return [...new Set(list.filter((u): u is string => typeof u === 'string' && own.has(u)))]
}

/** ไฟล์รูปที่ผ่านกติกา: ชนิด jpeg/png/webp และไม่เกิน 5MB */
export function isAllowedImage(file: { type: string; size: number }): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type) && file.size <= MAX_IMAGE_BYTES
}
