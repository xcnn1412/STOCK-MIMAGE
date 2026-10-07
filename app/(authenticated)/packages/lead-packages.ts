// โหลดแพ็กเกจของงาน (lead_packages + lead_package_units) และแพ็กเกจที่เลือกได้ — server-only (รับ service client จากผู้เรียก)
// ใช้ทั้ง /jobs/tracking (data.ts), /crm/[id] และ setLeadPackages · ไม่ใช้ .or() — อ่านแยกชุดแล้วรวมด้วย id
import type { createServiceClient } from '@/lib/supabase-server'
import { readAllRows } from '@/lib/read-all-rows'
import { sortPackages } from './package-logic'
import { PACKAGE_COLUMNS, type LeadPackageRow, type Package, type PickerPackage, type UnitKind } from './types'

type Db = ReturnType<typeof createServiceClient>

export interface LeadPackageDbRow {
  id: string
  lead_id: string
  package_id: string
  quantity: number
  created_at: string
}

export interface LeadPackageUnitDbRow {
  id: string
  lead_package_id: string
  requirement_id: string
  item_id: string | null
  kit_id: string | null
  variant: string | null
}

const fail = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`)
}

/**
 * แถว lead_packages ของงานเหล่านี้ + lead_package_units ของแถวเหล่านั้น (ดิบ) — อ่านด้วย readAllRows เรียง created_at,id
 * โหลดพัง = throw (ผู้เรียกตัดสินว่าจะล้มหรือแสดงว่าง)
 */
export async function loadLeadPackageRows(db: Db, leadIds: string[]): Promise<{ packages: LeadPackageDbRow[]; units: LeadPackageUnitDbRow[] }> {
  if (leadIds.length === 0) return { packages: [], units: [] }
  const lp = await readAllRows<LeadPackageDbRow>((from, to) =>
    db.from('lead_packages').select('id, lead_id, package_id, quantity, created_at').in('lead_id', leadIds).order('created_at').order('id').range(from, to),
  )
  fail('โหลดแพ็กเกจของงานไม่สำเร็จ', lp.error)
  const lpIds = lp.rows.map(r => r.id)
  if (lpIds.length === 0) return { packages: [], units: [] }
  const units = await readAllRows<LeadPackageUnitDbRow>((from, to) =>
    db
      .from('lead_package_units')
      .select('id, lead_package_id, requirement_id, item_id, kit_id, variant')
      .in('lead_package_id', lpIds)
      .order('created_at')
      .order('id')
      .range(from, to),
  )
  fail('โหลดชิ้นที่เลือกให้งานไม่สำเร็จ', units.error)
  return { packages: lp.rows, units: units.rows }
}

/** ชื่อหน่วย (อุปกรณ์เดี่ยว/กระเป๋า) ตาม id — ชุดเล็ก (เฉพาะที่ถูกเลือกให้งาน) */
async function unitNames(db: Db, itemIds: string[], kitIds: string[]): Promise<Map<string, string>> {
  const [items, kits] = await Promise.all([
    itemIds.length ? db.from('items').select('id, name').in('id', itemIds) : Promise.resolve({ data: [], error: null }),
    kitIds.length ? db.from('kits').select('id, name').in('id', kitIds) : Promise.resolve({ data: [], error: null }),
  ])
  fail('โหลดชื่ออุปกรณ์ไม่สำเร็จ', items.error ?? kits.error)
  const out = new Map<string, string>()
  for (const r of [...((items.data ?? []) as { id: string; name: string }[]), ...((kits.data ?? []) as { id: string; name: string }[])]) out.set(r.id, r.name)
  return out
}

/**
 * แพ็กเกจของแต่ละงาน (leadId → รายการ เรียงตามลำดับที่เลือก) พร้อมชื่อ/ราคา/สถานะเปิดใช้ และชิ้นที่ทีมขายเลือก + แบบประกอบ
 * งานที่ไม่มีแพ็กเกจ = ไม่มี key · โหลดพัง = throw
 */
export async function loadLeadPackages(db: Db, leadIds: string[]): Promise<Record<string, LeadPackageRow[]>> {
  const { packages: lps, units } = await loadLeadPackageRows(db, leadIds)
  if (lps.length === 0) return {}

  const pkgIds = [...new Set(lps.map(r => r.package_id))]
  const [{ data: pkgs, error }, names] = await Promise.all([
    db.from('packages').select(PACKAGE_COLUMNS).in('id', pkgIds).overrideTypes<Package[], { merge: false }>(),
    unitNames(
      db,
      [...new Set(units.flatMap(u => (u.item_id ? [u.item_id] : [])))],
      [...new Set(units.flatMap(u => (u.kit_id ? [u.kit_id] : [])))],
    ),
  ])
  fail('โหลดแพ็กเกจไม่สำเร็จ', error)
  const pkgById = new Map((pkgs ?? []).map(p => [p.id, p]))

  const out: Record<string, LeadPackageRow[]> = {}
  for (const lp of lps) {
    const pkg = pkgById.get(lp.package_id)
    ;(out[lp.lead_id] ??= []).push({
      id: lp.id,
      packageId: lp.package_id,
      packageName: pkg?.name ?? 'แพ็กเกจที่ถูกลบ',
      price: pkg?.price === null || pkg?.price === undefined ? null : Number(pkg.price),
      isActive: pkg?.is_active ?? false,
      quantity: lp.quantity,
      units: units
        .filter(u => u.lead_package_id === lp.id)
        .map(u => {
          const unitId = (u.item_id ?? u.kit_id) as string | null
          const kind: UnitKind = u.item_id ? 'item' : 'kit'
          return { requirementId: u.requirement_id, unitId: unitId ?? '', kind, unitName: (unitId && names.get(unitId)) || 'ชิ้นที่ถูกลบ', variant: u.variant }
        })
        .filter(u => u.unitId),
    })
  }
  return out
}

type PickerReqRow = {
  id: string
  package_id: string
  category_id: string
  quantity: number
  sort_order: number
  equipment_categories: { name: string; sales_pick: boolean; variants: string[] | null } | null
}

/**
 * แพ็กเกจที่เลือกให้งานได้พร้อมข้อกำหนด/ตัวเลือก — เปิดใช้ทั้งหมด + includeIds (ที่งานเลือกไว้แม้ปิดใช้แล้ว)
 * opts.onlyIds = โหลดเฉพาะแพ็กเกจเหล่านี้ (ใช้ตอนตรวจฝั่ง server / คำนวณคำเตือน)
 * ponytail: ไม่วน readAllRows ที่ packages/requirements — มีหลักสิบถึงร้อย ไม่ถึงเพดาน 1,000 แถว (เหมือน loadPackages)
 */
export async function loadPickerPackages(db: Db, opts: { includeIds?: string[]; onlyIds?: string[] } = {}): Promise<PickerPackage[]> {
  const only = opts.onlyIds
  if (only && only.length === 0) return []
  const include = [...new Set(opts.includeIds ?? [])]

  const base = () => db.from('packages').select(PACKAGE_COLUMNS)
  const [active, extra] = await Promise.all([
    only ? base().in('id', only).overrideTypes<Package[], { merge: false }>() : base().eq('is_active', true).overrideTypes<Package[], { merge: false }>(),
    !only && include.length ? base().in('id', include).overrideTypes<Package[], { merge: false }>() : Promise.resolve({ data: [] as Package[], error: null }),
  ])
  fail('โหลดแพ็กเกจไม่สำเร็จ', active.error ?? extra.error)
  const byId = new Map<string, Package>()
  for (const p of [...(active.data ?? []), ...(extra.data ?? [])]) byId.set(p.id, p)
  const ids = [...byId.keys()]
  if (ids.length === 0) return []

  const { data: reqs, error: reqError } = await db
    .from('package_requirements')
    .select('id, package_id, category_id, quantity, sort_order, equipment_categories(name, sales_pick, variants)')
    .in('package_id', ids)
    .order('sort_order')
    .overrideTypes<PickerReqRow[], { merge: false }>()
  fail('โหลดข้อกำหนดของแพ็กเกจไม่สำเร็จ', reqError)
  const reqIds = (reqs ?? []).map(r => r.id)
  const { data: opts2, error: optError } = reqIds.length
    ? await db.from('package_options').select('requirement_id, item_id, kit_id').in('requirement_id', reqIds)
    : { data: [] as { requirement_id: string; item_id: string | null; kit_id: string | null }[], error: null }
  fail('โหลดตัวเลือกอุปกรณ์ไม่สำเร็จ', optError)

  const optionIds = new Map<string, string[]>()
  for (const o of (opts2 ?? []) as { requirement_id: string; item_id: string | null; kit_id: string | null }[]) {
    const id = o.item_id ?? o.kit_id
    if (id) (optionIds.get(o.requirement_id) ?? optionIds.set(o.requirement_id, []).get(o.requirement_id)!).push(id)
  }

  return sortPackages([...byId.values()]).map(p => ({
    id: p.id,
    name: p.name,
    price: p.price === null ? null : Number(p.price),
    is_active: p.is_active,
    requirements: (reqs ?? [])
      .filter(r => r.package_id === p.id)
      .map(r => ({
        id: r.id,
        categoryId: r.category_id,
        categoryName: r.equipment_categories?.name ?? 'ประเภทที่ถูกลบ',
        quantity: r.quantity,
        salesPick: r.equipment_categories?.sales_pick ?? false,
        variants: r.equipment_categories?.variants ?? [],
        optionUnitIds: optionIds.get(r.id) ?? null,
      })),
  }))
}
