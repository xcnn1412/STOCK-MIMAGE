import type { createServiceClient } from '@/lib/supabase-server'
import { readAllRows } from '@/lib/read-all-rows'
import { sortPackages } from './package-logic'
import {
  PACKAGE_COLUMNS,
  type CategoryUnit,
  type CategoryUnits,
  type Package,
  type PackageDetail,
  type PackageOption,
  type PackageRequirement,
  type PackageSummary,
  type RequirementDetail,
} from './types'

type Db = ReturnType<typeof createServiceClient>

type ReqJoined = Pick<PackageRequirement, 'package_id' | 'category_id' | 'quantity' | 'sort_order'> & {
  equipment_categories: { name: string } | null
}

/**
 * แพ็กเกจทั้งหมดพร้อมสรุปข้อกำหนด (ชื่อประเภท × จำนวน) เรียง sort_order แล้วชื่อ · ค่าเริ่มต้น = เฉพาะที่เปิดใช้
 * ponytail: ไม่วน readAllRows — แพ็กเกจ/ข้อกำหนดมีหลักสิบถึงร้อย ไม่ถึงเพดาน 1,000 แถว
 */
export async function loadPackages(db: Db, opts: { includeInactive?: boolean } = {}): Promise<PackageSummary[]> {
  let query = db.from('packages').select(PACKAGE_COLUMNS)
  if (!opts.includeInactive) query = query.eq('is_active', true)
  const [{ data: pkgs }, { data: reqs }] = await Promise.all([
    query.overrideTypes<Package[], { merge: false }>(),
    db
      .from('package_requirements')
      .select('package_id, category_id, quantity, sort_order, equipment_categories(name)')
      .order('sort_order')
      .overrideTypes<ReqJoined[], { merge: false }>(),
  ])
  const byPackage = new Map<string, PackageSummary['requirements']>()
  for (const r of reqs ?? []) {
    const list = byPackage.get(r.package_id) ?? []
    list.push({ category_id: r.category_id, category_name: r.equipment_categories?.name ?? 'ประเภทที่ถูกลบ', quantity: r.quantity })
    byPackage.set(r.package_id, list)
  }
  return sortPackages((pkgs ?? []).map(p => ({ ...p, price: p.price === null ? null : Number(p.price), requirements: byPackage.get(p.id) ?? [] })))
}

type ReqDetailRow = PackageRequirement & {
  equipment_categories: { name: string; is_active: boolean; sales_pick: boolean } | null
}

/** แพ็กเกจหนึ่งแพ็กเกจพร้อมข้อกำหนด (เรียง sort_order) ชื่อประเภท และตัวเลือก · ไม่พบ = null */
export async function loadPackageDetail(db: Db, id: string): Promise<PackageDetail | null> {
  const { data: pkg } = await db.from('packages').select(PACKAGE_COLUMNS).eq('id', id).maybeSingle<Package>()
  if (!pkg) return null

  const { data: reqs } = await db
    .from('package_requirements')
    .select('id, package_id, category_id, quantity, note, sort_order, equipment_categories(name, is_active, sales_pick)')
    .eq('package_id', id)
    .order('sort_order')
    .overrideTypes<ReqDetailRow[], { merge: false }>()
  const reqIds = (reqs ?? []).map(r => r.id)
  const { data: opts } = reqIds.length
    ? await db.from('package_options').select('id, requirement_id, item_id, kit_id').in('requirement_id', reqIds).overrideTypes<PackageOption[], { merge: false }>()
    : { data: [] as PackageOption[] }

  const requirements: RequirementDetail[] = (reqs ?? []).map(({ equipment_categories: cat, ...r }) => {
    const mine = (opts ?? []).filter(o => o.requirement_id === r.id)
    return {
      ...r,
      category_name: cat?.name ?? 'ประเภทที่ถูกลบ',
      category_active: cat?.is_active ?? false,
      sales_pick: cat?.sales_pick ?? false,
      optionItemIds: mine.flatMap(o => (o.item_id ? [o.item_id] : [])),
      optionKitIds: mine.flatMap(o => (o.kit_id ? [o.kit_id] : [])),
    }
  })
  return { ...pkg, price: pkg.price === null ? null : Number(pkg.price), requirements }
}

/**
 * หน่วยอุปกรณ์ต่อประเภท: อุปกรณ์เดี่ยว + กระเป๋าที่มี category_id · อุปกรณ์ที่อยู่ในกระเป๋า (kit_contents) ติด inKit
 * อ่านครั้งเดียวต่อตารางด้วย readAllRows (items/kits เรียง created_at,id · kit_contents ไม่มี created_at จึงเรียง id)
 * opts.categoryIds = โหลดเฉพาะประเภทเหล่านี้ (ใช้ตอนตรวจฝั่ง server)
 */
export async function loadCategoryUnits(db: Db, opts: { categoryIds?: string[] } = {}): Promise<CategoryUnits> {
  const ids = opts.categoryIds
  if (ids && ids.length === 0) return {}

  const [items, kits, contents] = await Promise.all([
    readAllRows<{ id: string; name: string; serial_number: string | null; status: string; category_id: string }>((from, to) => {
      let q = db.from('items').select('id, name, serial_number, status, category_id').not('category_id', 'is', null)
      if (ids) q = q.in('category_id', ids)
      return q.order('created_at').order('id').range(from, to)
    }),
    readAllRows<{ id: string; name: string; category_id: string }>((from, to) => {
      let q = db.from('kits').select('id, name, category_id').not('category_id', 'is', null)
      if (ids) q = q.in('category_id', ids)
      return q.order('created_at').order('id').range(from, to)
    }),
    readAllRows<{ item_id: string }>((from, to) => db.from('kit_contents').select('item_id').order('id').range(from, to)),
  ])
  const error = items.error ?? kits.error ?? contents.error
  if (error) throw new Error(`โหลดอุปกรณ์ในประเภทไม่สำเร็จ: ${error.message}`)

  const inKit = new Set(contents.rows.map(c => c.item_id))
  const out: CategoryUnits = {}
  const push = (categoryId: string, unit: CategoryUnit) => (out[categoryId] ??= []).push(unit)
  for (const i of items.rows) push(i.category_id, { id: i.id, kind: 'item', name: i.name, serial: i.serial_number, status: i.status, inKit: inKit.has(i.id) })
  for (const k of kits.rows) push(k.category_id, { id: k.id, kind: 'kit', name: k.name, serial: null, status: 'available', inKit: false })
  for (const list of Object.values(out)) list.sort((a, b) => a.name.localeCompare(b.name, 'th'))
  return out
}
