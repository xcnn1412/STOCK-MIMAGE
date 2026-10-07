// type ของโมดูลแพ็กเกจ — ตาราง packages / package_requirements / package_options / lead_packages / lead_package_units
// ยังไม่อยู่ใน types/database.types.ts จึงเขียนมือ (ใช้คู่กับ .overrideTypes ที่ขอบเขต query)

/** ชนิดหน่วยอุปกรณ์: อุปกรณ์เดี่ยว (items) หรือกระเป๋า (kits — ของข้างในไปทั้งใบ) */
export type UnitKind = 'item' | 'kit'

/** หน่วยอุปกรณ์หนึ่งหน่วยในประเภท (ที่หน้าตัวเลือกและคำเตือนใช้) */
export interface CategoryUnit {
  /** items.id หรือ kits.id (uuid ไม่ชนกัน) */
  id: string
  kind: UnitKind
  name: string
  serial?: string | null
  /** สถานะ items.status · กระเป๋าใช้ 'available' เสมอ (ponytail: กระเป๋าไม่มีสถานะของตัวเอง) */
  status: string
  /** อุปกรณ์ที่อยู่ในกระเป๋า (kit_contents) — ไม่ใช่หน่วยของตัวเอง เลือกเป็นตัวเลือกไม่ได้ */
  inKit?: boolean
}

/** categoryId → หน่วยในประเภทนั้น (รวม inKit ไว้ให้หน้าเลือกกรองเอง) */
export type CategoryUnits = Record<string, CategoryUnit[]>

export interface Package {
  id: string
  name: string
  description: string | null
  price: number | null
  sort_order: number
  is_active: boolean
}

export const PACKAGE_COLUMNS = 'id, name, description, price, sort_order, is_active'

export interface PackageRequirement {
  id: string
  package_id: string
  category_id: string
  quantity: number
  note: string | null
  sort_order: number
}

export interface PackageOption {
  id: string
  requirement_id: string
  item_id: string | null
  kit_id: string | null
}

/** ข้อกำหนดพร้อมชื่อประเภทและตัวเลือก (หน้าแก้แพ็กเกจ) */
export interface RequirementDetail extends PackageRequirement {
  category_name: string
  category_active: boolean
  sales_pick: boolean
  /** item_id/kit_id ของตัวเลือก — [] = ทุกหน่วยในประเภท */
  optionItemIds: string[]
  optionKitIds: string[]
}

export interface PackageDetail extends Package {
  requirements: RequirementDetail[]
}

/** แพ็กเกจในรายการ /packages พร้อมสรุปข้อกำหนด */
export interface PackageSummary extends Package {
  requirements: { category_id: string; category_name: string; quantity: number }[]
}

/** แถวข้อกำหนดที่ส่งจากหน้าแก้แพ็กเกจ (setPackageRequirements แทนที่ทั้งชุด) */
export interface RequirementRowInput {
  categoryId: string
  quantity: number
  note?: string | null
  optionItemIds: string[]
  optionKitIds: string[]
}

// --- คำเตือน "อุปกรณ์อาจไม่พอ" (หัวข้อ 5.1) — input ของ capacityWarnings ---------------

/** ข้อกำหนดของแพ็กเกจในรูปที่คำเตือนใช้ */
export interface CapacityRequirement {
  id: string
  categoryId: string
  quantity: number
  /** id หน่วยในตัวเลือก (items.id/kits.id) — [] หรือ null = ทุกหน่วยในประเภท */
  optionUnitIds: string[] | null
}

export interface CapacityPackage {
  id: string
  name: string
  requirements: CapacityRequirement[]
}

export interface CapacityCategory {
  id: string
  name: string
  sales_pick: boolean
}

/** ชิ้นที่ถูกเลือกแน่นอนแล้วให้ข้อกำหนดหนึ่งของงาน (lead_package_units) */
export interface CapacityChosenUnit {
  requirementId: string
  unitId: string
  variant?: string | null
}

/** แพ็กเกจหนึ่งของงาน (lead_packages) */
export interface CapacityJobPackage {
  packageId: string
  /** จำนวนชุด */
  quantity: number
  units: CapacityChosenUnit[]
}

/** งานหนึ่งงาน (crm_leads) พร้อมช่วงเวลาและแพ็กเกจที่เลือก */
export interface CapacityJob {
  leadId: string
  /** ชื่อที่ใช้ในข้อความเตือน (ชื่อลูกค้า/งาน) */
  name: string
  eventDate: string | null
  eventTime?: string | null
  eventEndTime?: string | null
  /** งานปิดแล้ว/ยกเลิก — ไม่นับเป็นความต้องการ */
  closed?: boolean
  packages: CapacityJobPackage[]
  /**
   * บรรทัดใบจัดของที่เลือกหน่วยแล้ว (เฟส 3) — มีค่า = งานนี้มีใบจัดของ นับเฉพาะบรรทัดเหล่านี้เป็น "แน่นอน" และไม่มีส่วนประมาณการ
   * undefined = ยังไม่มีใบ ใช้ lead_package_units (แน่นอน) + ข้อกำหนดที่ยังไม่เลือกชิ้น (ประมาณการ)
   */
  packedUnits?: { categoryId: string; unitId: string }[]
}

/** ข้อมูลทั้งหมดที่ capacityWarnings ต้องใช้ — loader (packages/capacity-data.ts) โหลดมาให้ครบ */
export interface CapacityInput {
  /** งานที่กำลังเลือกแพ็กเกจ */
  target: CapacityJob
  /** งานอื่นใกล้วันเดียวกัน (loader โหลด [วันงาน−1, วันงาน+1]) — งาน target ปนมาได้ จะถูกข้ามด้วย leadId */
  others: CapacityJob[]
  /** packageId → แพ็กเกจ (ต้องครอบทุกแพ็กเกจที่ target และ others อ้างถึง) */
  packages: Record<string, CapacityPackage>
  categories: Record<string, CapacityCategory>
  unitsByCategory: CategoryUnits
}

export type CapacityLevel = 'red' | 'yellow'

export interface CapacityWarning {
  categoryId: string
  categoryName: string
  /** ชื่อแพ็กเกจของงานที่ต้องใช้ประเภทนี้ (หลายแพ็กเกจคั่น " + ") */
  packageName: string
  /** red = ไม่พอแน่นอน · yellow = อาจไม่พอเมื่อรวมงานที่ยังไม่เลือกชิ้น */
  level: CapacityLevel
  need: number
  capacity: number
  demandSure: number
  demandPlanned: number
  message: string
  /** งานอื่นที่ทำให้เตือน */
  leadIds: string[]
  /** ประเภทที่ทีมขายเลือกชิ้นเอง: ชิ้นที่ชนกับงานอื่น */
  unitId?: string
}
