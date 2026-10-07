// กติกาบริสุทธิ์ของแพ็กเกจ (ไม่แตะ next / supabase) — ตรวจด้วย package-logic.check.ts
import { resourceClashes } from '../jobs/tracking/tracking-logic'
import type {
  CapacityInput,
  CapacityJob,
  CapacityWarning,
  CategoryUnit,
  CategoryUnits,
  RequirementRowInput,
} from './types'

export const MAX_PACKAGE_NAME = 80
export const MAX_REQUIREMENT_QTY = 50
export const MAX_NOTE = 200

/** สถานะอุปกรณ์ที่นับเป็นของที่ใช้ได้ไม่ได้ (เสียหาย/ซ่อม/หาย/กำลังซื้อ/หมด) */
export const UNAVAILABLE_STATUSES: readonly string[] = ['damaged', 'maintenance', 'lost', 'purchasing', 'out_of_stock']

export interface PackageForm {
  name: string
  description: string | null
  price: number | null
  is_active: boolean
}

/** ตรวจฟอร์มแพ็กเกจ · ชื่อ trim 1–80 · ราคาว่าง = null · ติดลบ/ไม่ใช่ตัวเลข = error */
export function parsePackageForm(input: { name: unknown; description?: unknown; price?: unknown; is_active?: unknown }): PackageForm | { error: string } {
  const name = String(input.name ?? '').trim()
  if (!name) return { error: 'กรอกชื่อแพ็กเกจ' }
  if (name.length > MAX_PACKAGE_NAME) return { error: `ชื่อแพ็กเกจยาวเกิน ${MAX_PACKAGE_NAME} ตัวอักษร` }

  const description = String(input.description ?? '').trim() || null

  const rawPrice = input.price
  let price: number | null = null
  if (rawPrice !== null && rawPrice !== undefined && String(rawPrice).trim() !== '') {
    price = Number(String(rawPrice).replace(/,/g, '').trim())
    if (!Number.isFinite(price)) return { error: 'ราคาต้องเป็นตัวเลข' }
    if (price < 0) return { error: 'ราคาติดลบไม่ได้' }
  }

  const is_active = !(input.is_active === false || input.is_active === 'false' || input.is_active === 'off')
  return { name, description, price, is_active }
}

/** ตรวจแถวข้อกำหนด · จำนวนเต็ม 1–50 · ประเภทซ้ำในแพ็กเกจเดียวไม่ได้ · ตัดตัวเลือกซ้ำ */
export function parseRequirementRows(rows: unknown): RequirementRowInput[] | { error: string } {
  if (!Array.isArray(rows)) return { error: 'ข้อกำหนดไม่ถูกต้อง' }
  const out: RequirementRowInput[] = []
  const seen = new Set<string>()
  for (const [i, raw] of rows.entries()) {
    const r = (raw ?? {}) as Partial<RequirementRowInput>
    const categoryId = String(r.categoryId ?? '').trim()
    if (!categoryId) return { error: `แถวที่ ${i + 1}: เลือกประเภทอุปกรณ์` }
    if (seen.has(categoryId)) return { error: `แถวที่ ${i + 1}: ประเภทนี้มีในแพ็กเกจแล้ว — ใส่จำนวนรวมในแถวเดียว` }
    seen.add(categoryId)
    const quantity = Number(r.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_REQUIREMENT_QTY) {
      return { error: `แถวที่ ${i + 1}: จำนวนต้องเป็นจำนวนเต็ม 1–${MAX_REQUIREMENT_QTY}` }
    }
    const note = String(r.note ?? '').trim() || null
    if (note && note.length > MAX_NOTE) return { error: `แถวที่ ${i + 1}: หมายเหตุยาวเกิน ${MAX_NOTE} ตัวอักษร` }
    const uniq = (ids: unknown) => [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))]
    out.push({ categoryId, quantity, note, optionItemIds: uniq(r.optionItemIds), optionKitIds: uniq(r.optionKitIds) })
  }
  return out
}

/**
 * ตัวเลือกของทุกแถวต้องเป็นหน่วยในประเภทของแถวนั้น และไม่ใช่อุปกรณ์ที่อยู่ในกระเป๋า
 * ({ ok: true } | { error } ไทย) — server ตรวจซ้ำก่อนบันทึก
 */
export function checkOptionUnits(
  rows: RequirementRowInput[],
  unitsByCategory: CategoryUnits,
  categoryName: (id: string) => string = id => id,
): { ok: true } | { error: string } {
  for (const r of rows) {
    const units = new Map((unitsByCategory[r.categoryId] ?? []).map(u => [`${u.kind}:${u.id}`, u]))
    const picked = [...r.optionItemIds.map(id => `item:${id}`), ...r.optionKitIds.map(id => `kit:${id}`)]
    for (const key of picked) {
      const u = units.get(key)
      if (!u) return { error: `ตัวเลือกของ "${categoryName(r.categoryId)}" มีหน่วยที่ไม่ได้อยู่ในประเภทนี้ — โหลดหน้าใหม่แล้วเลือกอีกครั้ง` }
      if (u.inKit) return { error: `"${u.name}" อยู่ในกระเป๋า เลือกเป็นตัวเลือกเดี่ยวไม่ได้ — เลือกกระเป๋าทั้งใบแทน` }
    }
  }
  return { ok: true }
}

/**
 * หน่วยที่ใช้กับข้อกำหนดได้ · ตัวเลือกว่าง/null = ทุกหน่วยในประเภท ไม่งั้นเฉพาะที่อยู่ในรายการ
 * อุปกรณ์ที่อยู่ในกระเป๋า (inKit) ไม่ใช่หน่วยของตัวเอง → ไม่นับเสมอ
 */
export function allowedUnits<U extends Pick<CategoryUnit, 'id' | 'inKit'>>(requirement: { optionUnitIds: string[] | null }, unitsInCategory: U[]): U[] {
  const units = unitsInCategory.filter(u => !u.inKit)
  const ids = requirement.optionUnitIds
  if (!ids || ids.length === 0) return units
  const allow = new Set(ids)
  return units.filter(u => allow.has(u.id))
}

/** หน่วยนี้นับเป็นของที่ใช้ได้ไหม (สถานะไม่ใช่ เสียหาย/ซ่อม/หาย/กำลังซื้อ/หมด) */
export const isUsableStatus = (status: string): boolean => !UNAVAILABLE_STATUSES.includes(status)

/** สรุปข้อกำหนดบนการ์ด เช่น "คอมพิวเตอร์ ×1 · กล้อง ×2" · ไม่มี = "ยังไม่ตั้งอุปกรณ์" */
export function requirementSummary(reqs: { category_name: string; quantity: number }[]): string {
  if (reqs.length === 0) return 'ยังไม่ตั้งอุปกรณ์'
  return reqs.map(r => `${r.category_name} ×${r.quantity}`).join(' · ')
}

/** ชื่อของสำเนา "<ชื่อ> (สำเนา)" — ซ้ำต่อท้ายเลข "(สำเนา 2)", "(สำเนา 3)" … ตัดให้ไม่เกินความยาวชื่อ */
export function copyName(name: string, taken: string[]): string {
  const used = new Set(taken)
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? ' (สำเนา)' : ` (สำเนา ${n})`
    const candidate = name.slice(0, MAX_PACKAGE_NAME - suffix.length) + suffix
    if (!used.has(candidate)) return candidate
  }
}

/** เรียงตาม sort_order แล้วชื่อ (ภาษาไทย) — ไม่แก้ array เดิม */
export function sortPackages<T extends { sort_order: number; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'th'))
}

// --- คำเตือน "อุปกรณ์อาจไม่พอ" (หัวข้อ 5.1) ------------------------------------------

/** งานอื่นที่ยังไม่ปิดซึ่งช่วงเวลาทับกับ target (วันเดียวกัน เวลาทับ หรือฝั่งใดไม่มีเวลา = ทับทั้งวัน) */
function overlappingJobs(target: CapacityJob, others: CapacityJob[]): CapacityJob[] {
  const asBooking = (j: CapacityJob) => ({ resourceId: 'job', eventId: j.leadId, eventDate: j.eventDate, eventTime: j.eventTime, eventEndTime: j.eventEndTime })
  const open = others.filter(j => j.leadId !== target.leadId && !j.closed)
  const hit = new Set(
    resourceClashes(open.map(asBooking), asBooking(target))
      .filter(c => c.status !== 'queued')
      .map(c => c.eventId),
  )
  return open.filter(j => hit.has(j.leadId))
}

/** ชิ้นที่ถูกเลือกแน่นอนของงานหนึ่งในประเภทหนึ่ง (ใบจัดของถ้ามี ไม่งั้น lead_package_units) */
function sureUnitsOf(job: CapacityJob, categoryId: string, input: CapacityInput): { unitId: string; variant?: string | null }[] {
  if (job.packedUnits) return job.packedUnits.filter(u => u.categoryId === categoryId)
  const out: { unitId: string; variant?: string | null }[] = []
  for (const lp of job.packages) {
    const reqs = input.packages[lp.packageId]?.requirements ?? []
    for (const u of lp.units) {
      if (reqs.find(r => r.id === u.requirementId)?.categoryId === categoryId) out.push(u)
    }
  }
  return out
}

/** ความต้องการของงานหนึ่งในประเภทหนึ่งที่ยังไม่เลือกชิ้น (ประมาณการ) — งานที่มีใบจัดของ = 0 */
function plannedDemandOf(job: CapacityJob, categoryId: string, input: CapacityInput): number {
  if (job.packedUnits) return 0
  let total = 0
  for (const lp of job.packages) {
    for (const r of input.packages[lp.packageId]?.requirements ?? []) {
      if (r.categoryId !== categoryId) continue
      const chosen = lp.units.filter(u => u.requirementId === r.id).length
      total += Math.max(0, r.quantity * lp.quantity - chosen)
    }
  }
  return total
}

/**
 * คำเตือน "อุปกรณ์อาจไม่พอ" ของงาน target ต่อประเภทอุปกรณ์ (หัวข้อ 5.1) — pure รับข้อมูลที่โหลดมาครบแล้ว
 *
 * need       = Σ quantity × จำนวนชุด ของข้อกำหนดประเภทนั้นในทุกแพ็กเกจของ target
 * capacity   = หน่วยในตัวเลือก (ว่าง = ทุกหน่วยในประเภท) ที่สถานะใช้ได้
 * demandSure = ชิ้นที่งานอื่นที่เวลาทับเลือกแน่นอนแล้ว และอยู่ในชุดตัวเลือกเดียวกัน
 * demandPlanned = ความต้องการของงานอื่นที่เวลาทับซึ่งยังไม่เลือกชิ้น
 * red: capacity − demandSure < need · yellow: capacity − demandSure − demandPlanned < need
 * ประเภทที่ทีมขายเลือกชิ้นเอง: ชิ้นที่ target เลือกซ้ำกับงานอื่นที่เวลาทับ = red รายชิ้น (แบบประกอบไม่มีผล)
 * ไม่มีวันงาน = []
 *
 * ponytail: ประเภททั่วไปประเมินระดับประเภท ไม่จำลองว่าหน่วยไหนไปงานไหน · ประมาณการของงานอื่นนับเต็มไม่ดูว่าตัวเลือกของเขาทับกับของเราไหม
 * · หลายแพ็กเกจของ target ที่ใช้ประเภทเดียวกันรวมเป็นแถวเดียว ตัวเลือก = ยูเนียนของทุกข้อกำหนด — อัปเกรดเป็นจับคู่รายหน่วยถ้าเตือนพลาดบ่อย
 */
export function capacityWarnings(input: CapacityInput): CapacityWarning[] {
  const { target } = input
  if (!target.eventDate || target.packages.length === 0) return []
  const others = overlappingJobs(target, input.others)

  // รวมข้อกำหนดของ target ต่อประเภท (คงลำดับที่เจอ)
  type Need = { need: number; packageNames: string[]; optionIds: Set<string> | null; chosen: { unitId: string; variant?: string | null }[] }
  const needs = new Map<string, Need>()
  for (const lp of target.packages) {
    const pkg = input.packages[lp.packageId]
    if (!pkg) continue
    for (const r of pkg.requirements) {
      const n = needs.get(r.categoryId) ?? { need: 0, packageNames: [], optionIds: new Set<string>(), chosen: [] }
      n.need += r.quantity * lp.quantity
      if (!n.packageNames.includes(pkg.name)) n.packageNames.push(pkg.name)
      // ข้อกำหนดใดไม่ระบุตัวเลือก = ทุกหน่วยในประเภท → ทั้งประเภทใช้ได้
      if (!r.optionUnitIds || r.optionUnitIds.length === 0) n.optionIds = null
      else if (n.optionIds) r.optionUnitIds.forEach(id => n.optionIds!.add(id))
      n.chosen.push(...lp.units.filter(u => u.requirementId === r.id))
      needs.set(r.categoryId, n)
    }
  }

  const out: CapacityWarning[] = []
  for (const [categoryId, n] of needs) {
    const category = input.categories[categoryId]
    const categoryName = category?.name ?? 'ประเภทที่ถูกลบ'
    const packageName = n.packageNames.join(' + ')
    const allowed = allowedUnits({ optionUnitIds: n.optionIds ? [...n.optionIds] : null }, input.unitsByCategory[categoryId] ?? [])
    const allowedIds = new Set(allowed.map(u => u.id))
    const capacity = allowed.filter(u => isUsableStatus(u.status)).length
    const unitName = (id: string) => allowed.find(u => u.id === id)?.name ?? (input.unitsByCategory[categoryId] ?? []).find(u => u.id === id)?.name ?? 'ชิ้นที่ถูกลบ'

    let demandSure = 0
    let demandPlanned = 0
    const sureLeads: string[] = []
    const plannedLeads: string[] = []
    for (const job of others) {
      const sure = sureUnitsOf(job, categoryId, input).filter(u => allowedIds.has(u.unitId)).length
      const planned = plannedDemandOf(job, categoryId, input)
      demandSure += sure
      demandPlanned += planned
      if (sure > 0) sureLeads.push(job.leadId)
      if (planned > 0) plannedLeads.push(job.leadId)
    }
    const base = { categoryId, categoryName, packageName, need: n.need, capacity, demandSure, demandPlanned }

    // ประเภทที่ทีมขายเลือกชิ้นเอง: ชิ้นเดียวกันถูกเลือกให้งานอื่นที่เวลาทับ = ชนแน่นอน
    let unitClash = false
    if (category?.sales_pick) {
      for (const mine of n.chosen) {
        for (const job of others) {
          const theirs = sureUnitsOf(job, categoryId, input).find(u => u.unitId === mine.unitId)
          if (!theirs) continue
          unitClash = true
          out.push({
            ...base,
            level: 'red',
            leadIds: [job.leadId],
            unitId: mine.unitId,
            message: `${unitName(mine.unitId)} ถูกขายให้งาน ${job.name}${theirs.variant ? ` (${theirs.variant})` : ''} วันเดียวกัน`,
          })
        }
      }
    }
    if (unitClash) continue

    if (capacity - demandSure < n.need) {
      out.push({
        ...base,
        level: 'red',
        leadIds: sureLeads,
        message: `${categoryName} ไม่พอ — ต้องใช้ ${n.need} มีที่ใช้ได้ ${capacity}${demandSure ? ` และถูกเลือกให้งานอื่นที่เวลาทับแล้ว ${demandSure}` : ''}`,
      })
    } else if (capacity - demandSure - demandPlanned < n.need) {
      out.push({
        ...base,
        level: 'yellow',
        leadIds: [...new Set([...sureLeads, ...plannedLeads])],
        message: `${categoryName} อาจไม่พอ — ต้องใช้ ${n.need} มีที่ใช้ได้ ${capacity}${demandSure ? ` ถูกเลือกไปแล้ว ${demandSure}` : ''} และงานอื่นที่เวลาทับอาจใช้อีก ${demandPlanned}`,
      })
    }
  }
  return out
}
