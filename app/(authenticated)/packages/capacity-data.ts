// โหลดข้อมูลของคำเตือน "อุปกรณ์อาจไม่พอ" (หัวข้อ 5.1) สำหรับหลายงานพร้อมกัน + ข้อมูลของ PackagePicker — server-only
// อ่านครั้งเดียวต่อช่วงวัน แล้วคิดคำเตือนของทุกงานในหน่วยความจำด้วย capacityWarnings (pure)
// ไม่ใช้ .or() · อ่านที่อาจเกิน 1,000 แถวใช้ readAllRows
import type { createServiceClient } from '@/lib/supabase-server'
import { readAllRows } from '@/lib/read-all-rows'
import { addDays } from '../crm/types'
import { capacityWarnings } from './package-logic'
import { loadCategoryUnits } from './queries'
import { loadLeadPackageRows, loadLeadPackages, loadPickerPackages } from './lead-packages'
import type {
  CapacityCategory,
  CapacityJob,
  CapacityPackage,
  CapacityWarning,
  CategoryUnits,
  LeadPackageRow,
  PickerPackage,
  UnitBooking,
} from './types'

type Db = ReturnType<typeof createServiceClient>

/** สถานะ CRM ที่ถือว่างานปิดแล้ว — ไม่นับเป็นความต้องการของงานอื่น (งานที่เก็บเข้าคลังก็ไม่นับ) */
export const CLOSED_LEAD_STATUSES: readonly string[] = ['rejected', 'cancelled']

/** ทุกอย่างที่ capacityWarnings ต้องใช้ของงานในช่วงวันหนึ่ง (โหลดครั้งเดียว ใช้คิดได้หลายงาน) */
export interface CapacityData {
  /** งานในช่วงวันที่มีแพ็กเกจ (รวมงานที่ปิดแล้ว — ติด closed) */
  jobs: CapacityJob[]
  packages: Record<string, CapacityPackage>
  categories: Record<string, CapacityCategory>
  unitsByCategory: CategoryUnits
  /** ชิ้นที่งานที่ยังไม่ปิดเลือกไว้แล้ว — ป้ายความว่างใน PackagePicker */
  unitBookings: UnitBooking[]
}

const EMPTY: CapacityData = { jobs: [], packages: {}, categories: {}, unitsByCategory: {}, unitBookings: [] }

type LeadRow = {
  id: string
  customer_name: string | null
  event_location: string | null
  event_date: string | null
  event_time: string | null
  event_end_time: string | null
  status: string | null
  archived_at: string | null
}

const hhmm = (t: string | null) => (t ? String(t).slice(0, 5) : null)

/**
 * โหลดข้อมูลคำเตือนของงานในช่วงวัน
 * - opts.leadIds = งานเป้าหมาย → ช่วง = [วันงานแรก−1, วันงานสุดท้าย+1] (งานไม่มีวันงานไม่ขยายช่วง)
 * - opts.dateRange = ช่วงที่ผู้เรียกกำหนดเอง (ขยาย ±1 วันให้ — งานคร่อมเที่ยงคืนไม่หลุด)
 * ไม่มีช่วงเลย = ข้อมูลว่าง · โหลดพัง = throw
 */
export async function loadCapacityInputs(db: Db, opts: { leadIds?: string[]; dateRange?: { from: string; to: string } }): Promise<CapacityData> {
  let range = opts.dateRange ? { from: addDays(opts.dateRange.from, -1), to: addDays(opts.dateRange.to, 1) } : null
  if (!range && opts.leadIds?.length) {
    const { data, error } = await db.from('crm_leads').select('event_date').in('id', opts.leadIds)
    if (error) throw new Error(`โหลดวันงานไม่สำเร็จ: ${error.message}`)
    const dates = ((data ?? []) as { event_date: string | null }[]).map(r => r.event_date).filter((d): d is string => !!d).sort()
    if (dates.length) range = { from: addDays(dates[0], -1), to: addDays(dates[dates.length - 1], 1) }
  }
  if (!range) return EMPTY

  const leads = await readAllRows<LeadRow>((from, to) =>
    db
      .from('crm_leads')
      .select('id, customer_name, event_location, event_date, event_time, event_end_time, status, archived_at')
      .gte('event_date', range.from)
      .lte('event_date', range.to)
      .order('created_at')
      .order('id')
      .range(from, to),
  )
  if (leads.error) throw new Error(`โหลดงานในช่วงวันไม่สำเร็จ: ${leads.error.message}`)

  const { packages: lps, units } = await loadLeadPackageRows(db, leads.rows.map(l => l.id))
  if (lps.length === 0) return EMPTY

  const picker = await loadPickerPackages(db, { onlyIds: [...new Set(lps.map(r => r.package_id))] })
  const packages: Record<string, CapacityPackage> = {}
  const categories: Record<string, CapacityCategory> = {}
  for (const p of picker) {
    packages[p.id] = {
      id: p.id,
      name: p.name,
      requirements: p.requirements.map(r => ({ id: r.id, categoryId: r.categoryId, quantity: r.quantity, optionUnitIds: r.optionUnitIds })),
    }
    for (const r of p.requirements) categories[r.categoryId] = { id: r.categoryId, name: r.categoryName, sales_pick: r.salesPick }
  }
  const unitsByCategory = await loadCategoryUnits(db, { categoryIds: Object.keys(categories) })

  const leadById = new Map(leads.rows.map(l => [l.id, l]))
  const jobById = new Map<string, CapacityJob>()
  for (const lp of lps) {
    const l = leadById.get(lp.lead_id)
    if (!l) continue
    let job = jobById.get(l.id)
    if (!job) {
      job = {
        leadId: l.id,
        name: l.customer_name || l.event_location || 'ไม่ระบุลูกค้า',
        eventDate: l.event_date,
        eventTime: hhmm(l.event_time),
        eventEndTime: hhmm(l.event_end_time),
        closed: !!l.archived_at || CLOSED_LEAD_STATUSES.includes(l.status ?? ''),
        packages: [],
      }
      jobById.set(l.id, job)
    }
    job.packages.push({
      packageId: lp.package_id,
      quantity: lp.quantity,
      units: units
        .filter(u => u.lead_package_id === lp.id && (u.item_id || u.kit_id))
        .map(u => ({ requirementId: u.requirement_id, unitId: (u.item_id ?? u.kit_id) as string, variant: u.variant })),
    })
  }
  const jobs = [...jobById.values()]

  const unitBookings: UnitBooking[] = jobs
    .filter(j => !j.closed)
    .flatMap(j =>
      j.packages.flatMap(p =>
        p.units.map(u => ({ unitId: u.unitId, leadId: j.leadId, leadName: j.name, eventDate: j.eventDate, eventTime: j.eventTime, eventEndTime: j.eventEndTime, variant: u.variant })),
      ),
    )

  return { jobs, packages, categories, unitsByCategory, unitBookings }
}

/** คำเตือนของแต่ละงานจากข้อมูลที่โหลดแล้ว (pure) — งานที่ไม่มีแพ็กเกจ/ไม่มีวันงาน = [] */
export function warningsForLeads(data: CapacityData, leadIds: string[]): Record<string, CapacityWarning[]> {
  const out: Record<string, CapacityWarning[]> = {}
  for (const id of leadIds) {
    const target = data.jobs.find(j => j.leadId === id)
    out[id] = target
      ? capacityWarnings({ target, others: data.jobs, packages: data.packages, categories: data.categories, unitsByCategory: data.unitsByCategory })
      : []
  }
  return out
}

/** โหลด + คิดคำเตือนของหลายงานในครั้งเดียว (data.ts / setLeadPackages / หน้า lead) */
export async function capacityWarningsForLeads(
  db: Db,
  opts: { leadIds: string[]; dateRange?: { from: string; to: string } },
): Promise<{ warnings: Record<string, CapacityWarning[]>; data: CapacityData }> {
  const data = await loadCapacityInputs(db, opts.dateRange ? { dateRange: opts.dateRange } : { leadIds: opts.leadIds })
  return { warnings: warningsForLeads(data, opts.leadIds), data }
}

/** ทุกอย่างที่ PackagePicker ต้องใช้ของหลายงาน */
export interface PickerContext {
  leadPackages: Record<string, LeadPackageRow[]>
  /** แพ็กเกจเปิดใช้ + ที่งานเหล่านี้เลือกไว้แม้ปิดใช้ */
  packages: PickerPackage[]
  /** หน่วยของประเภทที่ทีมขายเลือกชิ้นเอง */
  salesPickUnits: CategoryUnits
  unitBookings: UnitBooking[]
  capacityWarnings: Record<string, CapacityWarning[]>
}

export const EMPTY_PICKER_CONTEXT: PickerContext = { leadPackages: {}, packages: [], salesPickUnits: {}, unitBookings: [], capacityWarnings: {} }

/**
 * ข้อมูลของ PackagePicker สำหรับหลายงานในครั้งเดียว
 * - warningLeadIds = งานที่ต้องคิดคำเตือน (ค่าเริ่มต้น = ทุกงานใน leadIds) · bookingRange = ช่วงวันของป้ายความว่าง/คำเตือน
 * ยังไม่รัน migration 20261011 / โหลดพัง → ข้อมูลว่าง (หน้าไม่ล้ม — แค่ไม่มีช่องแพ็กเกจให้เลือก) + console.error
 */
export async function loadPickerContext(
  db: Db,
  leadIds: string[],
  opts: { warningLeadIds?: string[]; dateRange?: { from: string; to: string } } = {},
): Promise<PickerContext> {
  try {
    const leadPackages = await loadLeadPackages(db, leadIds)
    const chosenIds = [...new Set(Object.values(leadPackages).flat().map(r => r.packageId))]
    const [packages, capacity] = await Promise.all([
      loadPickerPackages(db, { includeIds: chosenIds }),
      capacityWarningsForLeads(db, { leadIds: opts.warningLeadIds ?? leadIds, dateRange: opts.dateRange }),
    ])
    const salesPickCats = [...new Set(packages.flatMap(p => p.requirements.filter(r => r.salesPick).map(r => r.categoryId)))]
    const salesPickUnits = await loadCategoryUnits(db, { categoryIds: salesPickCats })
    return { leadPackages, packages, salesPickUnits, unitBookings: capacity.data.unitBookings, capacityWarnings: capacity.warnings }
  } catch (e) {
    console.error('loadPickerContext', e)
    return EMPTY_PICKER_CONTEXT
  }
}
