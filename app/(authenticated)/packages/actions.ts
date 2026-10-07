'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import { getKitManager } from '@/lib/kit-bookings'
import { requireAuth } from '@/lib/auth'
import { canEditLeadPackages, checkLeadPicks, checkOptionUnits, copyName, leadPackageName, parsePackageForm, parseRequirementRows, quotedPriceFor } from './package-logic'
import { capacityWarningsForLeads } from './capacity-data'
import { loadPickerPackages } from './lead-packages'
import { loadCategoryUnits, loadPackageDetail } from './queries'
import { isWonStatus } from '../crm/types'
import { createNotifications } from '@/lib/notifications'
import { packingRequestedMessage, packingRequestedRecipients } from '../packing/notify'
import type { CapacityWarning, CategoryUnits, LeadPackagePick, PickerPackage, RequirementRowInput } from './types'

const NO_ACCESS = 'เฉพาะ admin และแผนกที่ดูแลอุปกรณ์เท่านั้นที่แก้แพ็กเกจได้'
const DUPLICATE = 'มีแพ็กเกจชื่อนี้อยู่แล้ว'

export interface PackageInput {
  name: string
  description: string
  /** ข้อความจากช่องราคา — ว่าง = ไม่ระบุ */
  price: string | number | null
  is_active: boolean
}

type Result = { error: string } | { success: true }

function revalidateAll() {
  revalidatePath('/packages')
  revalidatePath('/packages/[id]', 'page')
}

async function nextSortOrder(db: ReturnType<typeof createServiceClient>): Promise<number> {
  const { data } = await db.from('packages').select('sort_order').order('sort_order', { ascending: false }).limit(1)
  return ((data?.[0]?.sort_order as number | undefined) ?? -1) + 1
}

export async function createPackage(input: PackageInput): Promise<{ error: string } | { id: string }> {
  const manager = await getKitManager()
  if (!manager) return { error: NO_ACCESS }
  const parsed = parsePackageForm(input)
  if ('error' in parsed) return parsed

  const db = createServiceClient()
  const { data, error } = await db
    .from('packages')
    .insert({ ...parsed, sort_order: await nextSortOrder(db), created_by: manager.userId })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) {
    if (error?.code === '23505') return { error: DUPLICATE }
    console.error('createPackage', error)
    return { error: 'เพิ่มแพ็กเกจไม่สำเร็จ' }
  }

  await logActivity('CREATE_PACKAGE', { id: data.id, ...parsed })
  revalidateAll()
  return { id: data.id }
}

export async function updatePackage(id: string, input: PackageInput): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_ACCESS }
  const parsed = parsePackageForm(input)
  if ('error' in parsed) return parsed

  const db = createServiceClient()
  const { data: old } = await db.from('packages').select('name, description, price, is_active').eq('id', id).maybeSingle()
  if (!old) return { error: 'ไม่พบแพ็กเกจนี้' }

  const { error } = await db.from('packages').update({ ...parsed, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) {
    if (error.code === '23505') return { error: DUPLICATE }
    console.error('updatePackage', error)
    return { error: 'บันทึกแพ็กเกจไม่สำเร็จ' }
  }

  await logActivity('UPDATE_PACKAGE', { id, from: old, to: parsed })
  revalidateAll()
  return { success: true }
}

export async function deletePackage(id: string): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_ACCESS }
  const db = createServiceClient()

  const { data: pkg } = await db.from('packages').select('name').eq('id', id).maybeSingle<{ name: string }>()
  if (!pkg) return { error: 'ไม่พบแพ็กเกจนี้' }

  const { count, error: countError } = await db.from('lead_packages').select('id', { count: 'exact', head: true }).eq('package_id', id)
  if (countError) return { error: 'ตรวจงานที่ใช้แพ็กเกจไม่สำเร็จ ลองใหม่อีกครั้ง' }
  if ((count ?? 0) > 0) return { error: `ลบไม่ได้ — มีงาน ${count} งานเลือกแพ็กเกจนี้อยู่ ให้ปิดใช้แทน` }

  // ข้อกำหนดและตัวเลือกลบตามด้วย ON DELETE CASCADE
  const { error } = await db.from('packages').delete().eq('id', id)
  if (error) {
    console.error('deletePackage', error)
    return { error: 'ลบแพ็กเกจไม่สำเร็จ' }
  }

  await logActivity('DELETE_PACKAGE', { id, name: pkg.name })
  revalidateAll()
  return { success: true }
}

/** คัดลอกแพ็กเกจ + ข้อกำหนด + ตัวเลือก เป็น "<ชื่อ> (สำเนา)" (ซ้ำต่อท้ายเลข) ต่อท้ายรายการ */
export async function duplicatePackage(id: string): Promise<{ error: string } | { id: string }> {
  const manager = await getKitManager()
  if (!manager) return { error: NO_ACCESS }
  const db = createServiceClient()

  const src = await loadPackageDetail(db, id)
  if (!src) return { error: 'ไม่พบแพ็กเกจนี้' }
  const { data: names } = await db.from('packages').select('name')
  const name = copyName(src.name, (names ?? []).map(n => n.name as string))

  const { data: created, error } = await db
    .from('packages')
    .insert({ name, description: src.description, price: src.price, is_active: src.is_active, sort_order: await nextSortOrder(db), created_by: manager.userId })
    .select('id')
    .single<{ id: string }>()
  if (error || !created) {
    if (error?.code === '23505') return { error: 'มีแพ็กเกจชื่อสำเนานี้อยู่แล้ว ลองอีกครั้ง' }
    console.error('duplicatePackage', error)
    return { error: 'คัดลอกแพ็กเกจไม่สำเร็จ' }
  }

  const saved = await writeRequirements(
    db,
    created.id,
    src.requirements.map(r => ({ categoryId: r.category_id, quantity: r.quantity, note: r.note, optionItemIds: r.optionItemIds, optionKitIds: r.optionKitIds })),
  )
  if ('error' in saved) {
    await db.from('packages').delete().eq('id', created.id)
    return saved
  }

  await logActivity('DUPLICATE_PACKAGE', { from: id, id: created.id, name })
  revalidateAll()
  return { id: created.id }
}

/**
 * แทนที่ข้อกำหนดทั้งชุดของแพ็กเกจ: ลบแถวที่หายไป (ตัวเลือกลบตาม) · upsert ที่เหลือตามประเภท (id เดิมคงอยู่) · ตัวเลือกแทนที่ทั้งชุดต่อแถว
 * ponytail: หลายคำขอไม่อยู่ใน transaction เดียว — พังกลางทาง ผู้ใช้กดบันทึกซ้ำได้ (แทนที่ทั้งชุด)
 */
async function writeRequirements(db: ReturnType<typeof createServiceClient>, packageId: string, rows: RequirementRowInput[]): Promise<Result> {
  const { data: existing, error: readError } = await db.from('package_requirements').select('id, category_id').eq('package_id', packageId)
  if (readError) return { error: 'อ่านข้อกำหนดเดิมไม่สำเร็จ' }

  const keep = new Set(rows.map(r => r.categoryId))
  const removed = (existing ?? []).filter(r => !keep.has(r.category_id as string)).map(r => r.id as string)
  if (removed.length) {
    const { error } = await db.from('package_requirements').delete().in('id', removed)
    if (error) return { error: 'ลบข้อกำหนดเดิมไม่สำเร็จ' }
  }
  if (rows.length === 0) return { success: true }

  const { data: saved, error: upsertError } = await db
    .from('package_requirements')
    .upsert(
      rows.map((r, i) => ({ package_id: packageId, category_id: r.categoryId, quantity: r.quantity, note: r.note ?? null, sort_order: i })),
      { onConflict: 'package_id,category_id' },
    )
    .select('id, category_id')
  if (upsertError || !saved) {
    console.error('writeRequirements upsert', upsertError)
    return { error: 'บันทึกข้อกำหนดไม่สำเร็จ' }
  }
  const reqIdOf = new Map(saved.map(r => [r.category_id as string, r.id as string]))
  const reqIds = [...reqIdOf.values()]

  const { error: clearError } = await db.from('package_options').delete().in('requirement_id', reqIds)
  if (clearError) return { error: 'ล้างตัวเลือกอุปกรณ์เดิมไม่สำเร็จ' }
  const options = rows.flatMap(r => {
    const requirement_id = reqIdOf.get(r.categoryId)!
    return [
      ...r.optionItemIds.map(item_id => ({ requirement_id, item_id, kit_id: null })),
      ...r.optionKitIds.map(kit_id => ({ requirement_id, item_id: null, kit_id })),
    ]
  })
  if (options.length) {
    const { error } = await db.from('package_options').insert(options)
    if (error) {
      console.error('writeRequirements options', error)
      return { error: 'บันทึกตัวเลือกอุปกรณ์ไม่สำเร็จ' }
    }
  }
  return { success: true }
}

export async function setPackageRequirements(packageId: string, rows: RequirementRowInput[]): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_ACCESS }
  const parsed = parseRequirementRows(rows)
  if ('error' in parsed) return parsed

  const db = createServiceClient()
  const { data: pkg } = await db.from('packages').select('id, name').eq('id', packageId).maybeSingle<{ id: string; name: string }>()
  if (!pkg) return { error: 'ไม่พบแพ็กเกจนี้' }

  const categoryIds = parsed.map(r => r.categoryId)
  const { data: cats } = categoryIds.length
    ? await db.from('equipment_categories').select('id, name').in('id', categoryIds)
    : { data: [] as { id: string; name: string }[] }
  const catName = new Map((cats ?? []).map(c => [c.id as string, c.name as string]))
  if (categoryIds.some(id => !catName.has(id))) return { error: 'มีประเภทอุปกรณ์ที่ไม่พบแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง' }

  let units
  try {
    units = await loadCategoryUnits(db, { categoryIds })
  } catch (e) {
    console.error('setPackageRequirements units', e)
    return { error: 'ตรวจอุปกรณ์ในประเภทไม่สำเร็จ ลองใหม่อีกครั้ง' }
  }
  const unitsOk = checkOptionUnits(parsed, units, id => catName.get(id) ?? id)
  if ('error' in unitsOk) return unitsOk

  const saved = await writeRequirements(db, packageId, parsed)
  if ('error' in saved) return saved
  await db.from('packages').update({ updated_at: new Date().toISOString() }).eq('id', packageId)

  await logActivity('UPDATE_PACKAGE_REQUIREMENTS', {
    id: packageId,
    name: pkg.name,
    requirements: parsed.map(r => ({ category: catName.get(r.categoryId), quantity: r.quantity, items: r.optionItemIds.length, kits: r.optionKitIds.length })),
  })
  revalidateAll()
  return { success: true }
}

/** เรียงใหม่ — ids = ลำดับใหม่ทั้งรายการ (sort_order = ตำแหน่ง) */
export async function reorderPackages(ids: string[]): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_ACCESS }
  if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length) return { error: 'ลำดับแพ็กเกจไม่ถูกต้อง' }

  const db = createServiceClient()
  const results = await Promise.all(ids.map((id, i) => db.from('packages').update({ sort_order: i }).eq('id', id)))
  if (results.some(r => r.error)) return { error: 'เรียงแพ็กเกจไม่สำเร็จ' }

  await logActivity('REORDER_PACKAGES', { ids })
  revalidateAll()
  return { success: true }
}

// --- แพ็กเกจของงาน (เฟส 2 รอบ B) --------------------------------------------------

export type SetLeadPackagesResult =
  | { error: string }
  | {
      success: true
      /** คำเตือนอุปกรณ์อาจไม่พอของงานนี้หลังบันทึก — แสดงใต้ตัวเลือกทันที */
      warnings: CapacityWarning[]
      /** ราคาเสนอที่เพิ่งเติมให้ (null = ไม่ได้แก้) — หน้า lead ใช้ปรับค่าในฟอร์มการ์ดการเงิน */
      quotedPrice: number | null
      packageName: string | null
    }

/**
 * แทนที่แพ็กเกจของงานทั้งชุด (lead_packages + lead_package_units) แล้วคืนคำเตือนอุปกรณ์อาจไม่พอ
 * สิทธิ์: แอดมิน · ฝ่ายประสานงาน · ผู้สร้างการ์ด · sync crm_leads.package_name = ชื่อแพ็กเกจคั่น " + " และเติมราคาเสนอเมื่อยังว่าง
 * ponytail: หลายคำขอไม่อยู่ใน transaction เดียว — พังกลางทาง ผู้ใช้กดบันทึกซ้ำได้ (แทนที่ทั้งชุด)
 */
export async function setLeadPackages(leadId: string, picks: LeadPackagePick[]): Promise<SetLeadPackagesResult> {
  const session = await requireAuth()
  if (!session) return { error: 'กรุณาเข้าสู่ระบบใหม่' }
  const db = createServiceClient()

  const { data: lead } = await db
    .from('crm_leads')
    .select('id, customer_name, created_by, quoted_price, status')
    .eq('id', leadId)
    .maybeSingle<{ id: string; customer_name: string | null; created_by: string | null; quoted_price: number | null; status: string | null }>()
  if (!lead) return { error: 'ไม่พบงานนี้' }
  if (!canEditLeadPackages({ userId: session.userId, isAdmin: session.role === 'admin', department: session.department }, lead.created_by)) {
    return { error: 'เฉพาะแอดมิน ฝ่ายประสานงาน และผู้สร้างการ์ดเท่านั้นที่เลือกแพ็กเกจให้งานได้' }
  }

  const { data: existing, error: existingError } = await db.from('lead_packages').select('id, package_id').eq('lead_id', leadId)
  if (existingError) return { error: 'อ่านแพ็กเกจเดิมของงานไม่สำเร็จ ลองใหม่อีกครั้ง' }
  const existingRows = (existing ?? []) as { id: string; package_id: string }[]

  let pkgList: PickerPackage[]
  let units: CategoryUnits
  try {
    const ids = [...new Set([...(Array.isArray(picks) ? picks.map(p => String(p?.packageId ?? '')) : []), ...existingRows.map(r => r.package_id)])].filter(Boolean)
    pkgList = await loadPickerPackages(db, { onlyIds: ids })
    const salesPickCats = [...new Set(pkgList.flatMap(p => p.requirements.filter(r => r.salesPick).map(r => r.categoryId)))]
    units = await loadCategoryUnits(db, { categoryIds: salesPickCats })
  } catch (e) {
    console.error('setLeadPackages load', e)
    return { error: 'โหลดข้อมูลแพ็กเกจไม่สำเร็จ ลองใหม่อีกครั้ง' }
  }
  const pkgById = Object.fromEntries(pkgList.map(p => [p.id, p]))
  const checked = checkLeadPicks(picks, pkgById, units, existingRows.map(r => r.package_id))
  if ('error' in checked) return checked

  // 1) ลบแพ็กเกจที่ถูกเอาออก (ชิ้นที่เลือกลบตามด้วย CASCADE)
  const keep = new Set(checked.map(p => p.packageId))
  const removed = existingRows.filter(r => !keep.has(r.package_id)).map(r => r.id)
  if (removed.length) {
    const { error } = await db.from('lead_packages').delete().in('id', removed)
    if (error) return { error: 'ลบแพ็กเกจเดิมของงานไม่สำเร็จ' }
  }

  // 2) upsert ที่เหลือ (id เดิมคงอยู่ — ลำดับที่เลือกเดิมไม่เปลี่ยน) แล้วแทนที่ชิ้นที่เลือกทั้งชุด
  if (checked.length) {
    const { data: saved, error } = await db
      .from('lead_packages')
      .upsert(
        checked.map(p => ({ lead_id: leadId, package_id: p.packageId, quantity: p.quantity, created_by: session.userId })),
        { onConflict: 'lead_id,package_id', ignoreDuplicates: false },
      )
      .select('id, package_id')
    if (error || !saved) {
      console.error('setLeadPackages upsert', error)
      return { error: 'บันทึกแพ็กเกจของงานไม่สำเร็จ' }
    }
    const lpIdOf = new Map((saved as { id: string; package_id: string }[]).map(r => [r.package_id, r.id]))
    const { error: clearError } = await db.from('lead_package_units').delete().in('lead_package_id', [...lpIdOf.values()])
    if (clearError) return { error: 'ล้างชิ้นที่เลือกเดิมไม่สำเร็จ' }
    const rows = checked.flatMap(p =>
      p.units.map(u => ({
        lead_package_id: lpIdOf.get(p.packageId)!,
        requirement_id: u.requirementId,
        item_id: u.kind === 'item' ? u.unitId : null,
        kit_id: u.kind === 'kit' ? u.unitId : null,
        variant: u.variant,
      })),
    )
    if (rows.length) {
      const { error: unitError } = await db.from('lead_package_units').insert(rows)
      if (unitError) {
        console.error('setLeadPackages units', unitError)
        return { error: unitError.code === '23505' ? 'มีชิ้นที่ถูกเลือกซ้ำในงานนี้' : 'บันทึกชิ้นที่เลือกไม่สำเร็จ' }
      }
    }
  }

  // 3) sync ชื่อแพ็กเกจบนการ์ด CRM (ทุกหน้าที่อ่าน package_name แสดงค่าดิบได้) + เติมราคาเสนอเมื่อยังว่าง
  const packageName = leadPackageName(checked, pkgById)
  const quotedPrice = quotedPriceFor(lead.quoted_price, checked, pkgById)
  const { error: leadError } = await db
    .from('crm_leads')
    .update({ package_name: packageName, ...(quotedPrice !== null ? { quoted_price: quotedPrice } : {}), updated_at: new Date().toISOString() })
    .eq('id', leadId)
  if (leadError) console.error('setLeadPackages lead sync', leadError)

  await logActivity('SET_LEAD_PACKAGES', {
    leadId,
    customer_name: lead.customer_name,
    picks: checked.map(p => ({ packageId: p.packageId, name: pkgById[p.packageId]?.name, quantity: p.quantity, units: p.units })),
    ...(quotedPrice !== null ? { quoted_price: quotedPrice } : {}),
  })
  revalidatePath('/jobs/tracking')
  revalidatePath(`/crm/${leadId}`)
  revalidatePath('/crm')
  revalidatePath('/dashboard')

  // งานตอบรับแล้ว (มีใบงานหน้างาน) → แจ้งทีมจัดของ · ไม่แจ้งซ้ำถ้างานมีใบจัดของแล้ว · ยังไม่ตอบรับ = แจ้งตอนตอบรับ (autoCreateJobsFromAcceptedLead)
  if (checked.length > 0 && isWonStatus(lead.status)) {
    try {
      await createNotifications({
        userIds: await packingRequestedRecipients(db, leadId),
        type: 'packing_requested',
        ...packingRequestedMessage(lead.customer_name),
        referenceType: 'crm_lead',
        referenceId: leadId,
        actorId: session.userId,
      })
    } catch (e) {
      console.error('setLeadPackages packing_requested', e)
    }
  }

  // 4) คำเตือนหลังบันทึก — คิดพังไม่ทำให้การบันทึกล้ม (คืน [] แทน)
  let warnings: CapacityWarning[] = []
  try {
    warnings = (await capacityWarningsForLeads(db, { leadIds: [leadId] })).warnings[leadId] ?? []
  } catch (e) {
    console.error('setLeadPackages warnings', e)
  }
  return { success: true, warnings, quotedPrice, packageName }
}
