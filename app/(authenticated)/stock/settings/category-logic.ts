// กติกาบริสุทธิ์ของประเภทอุปกรณ์ (ไม่แตะ next / supabase) — ตรวจด้วย category-logic.check.ts

export const MAX_NAME = 60
export const MAX_VARIANTS = 20

export interface CategoryForm {
  name: string
  sales_pick: boolean
  variants: string[]
}

/**
 * ตรวจค่าจากฟอร์มประเภท · variants รับเป็นข้อความ (แยกด้วยขึ้นบรรทัดหรือจุลภาค) หรือ array
 * ตัดช่องว่างหัวท้าย ตัดแถวว่าง ตัดชื่อซ้ำ (เก็บตัวแรก)
 */
export function parseCategoryForm(input: {
  name: unknown
  sales_pick: unknown
  variants: unknown
}): CategoryForm | { error: string } {
  const name = String(input.name ?? '').trim()
  if (!name) return { error: 'กรอกชื่อประเภทอุปกรณ์' }
  if (name.length > MAX_NAME) return { error: `ชื่อประเภทยาวเกิน ${MAX_NAME} ตัวอักษร` }

  const raw = Array.isArray(input.variants) ? input.variants.map(String) : String(input.variants ?? '').split(/[\n,]/)
  const variants: string[] = []
  for (const v of raw.map(s => s.trim())) {
    if (v && !variants.includes(v)) variants.push(v)
  }
  if (variants.length > MAX_VARIANTS) return { error: `แบบประกอบได้ไม่เกิน ${MAX_VARIANTS} แบบ` }

  return { name, sales_pick: input.sales_pick === true || input.sales_pick === 'on' || input.sales_pick === 'true', variants }
}

/** ลบประเภทได้เมื่อไม่มีอุปกรณ์และกระเป๋าอ้างถึง */
export function canDeleteCategory(counts: { items: number; kits: number }): { ok: true } | { error: string } {
  if (counts.items === 0 && counts.kits === 0) return { ok: true }
  const used = [counts.items > 0 && `อุปกรณ์ ${counts.items} ชิ้น`, counts.kits > 0 && `กระเป๋า ${counts.kits} ใบ`].filter(Boolean).join(' และ ')
  return { error: `ลบไม่ได้ — ยังมี${used}อยู่ในประเภทนี้ ย้ายออกก่อนหรือปิดใช้แทน` }
}

/** เรียงตาม sort_order แล้วชื่อ (ภาษาไทย) — ไม่แก้ array เดิม */
export function sortCategories<T extends { sort_order: number; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'th'))
}
