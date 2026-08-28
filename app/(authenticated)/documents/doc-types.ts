// ============================================================================
// Document Control — config กลางของโมดูล "เอกสาร"
// ฟอร์ม / validation / PDF / actions อ่านไฟล์นี้ร่วมกัน (spec: docs/specs/documents-module.md)
// ponytail: plain TS ไม่มี 'use client'/'use server' — import ได้ทั้งสองฝั่ง
// ============================================================================

// ── สถานะ ────────────────────────────────────────────────────────────────────

export const DOC_STATUSES = [
  'draft', 'pending_approval', 'rejected', 'issued', 'sent', 'void', 'closed',
] as const

export type DocStatus = (typeof DOC_STATUSES)[number]

export const STATUS_LABEL: Record<DocStatus, { th: string; en: string; color: string }> = {
  draft:            { th: 'ร่าง',        en: 'Draft',            color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
  pending_approval: { th: 'รออนุมัติ',   en: 'Pending',          color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  rejected:         { th: 'ตีกลับ',      en: 'Rejected',         color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  issued:           { th: 'ออกเลขแล้ว',  en: 'Issued',           color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  sent:             { th: 'ส่งแล้ว',     en: 'Sent',             color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  void:             { th: 'ยกเลิก',      en: 'Void',             color: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 line-through' },
  closed:           { th: 'ปิดงาน',      en: 'Closed',           color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
}

/** สถานะที่ยังแก้เนื้อหาได้ */
export const EDITABLE_STATUSES: DocStatus[] = ['draft', 'rejected']

// ── ประเภทเอกสาร ─────────────────────────────────────────────────────────────

export const DOC_TYPE_CODES = [
  'QT', 'JO', 'IV', 'TX', 'RC', 'CN', 'PO', 'CT', 'DN', 'MM', 'JA', 'IA', 'RS', 'SC',
] as const

export type DocTypeCode = (typeof DOC_TYPE_CODES)[number]

export type PartyKind = 'customer' | 'vendor' | 'applicant' | 'employee' | 'none'

/** คอลัมน์ของ metaField ชนิด 'table' */
export interface MetaColumn {
  key: string
  label: string
  type?: 'text' | 'number'
}

/** ค่าใน meta ของ metaField ชนิด 'table' — array ของแถว */
export type MetaTableRow = Record<string, string>

export interface MetaField {
  key: string
  label: { th: string; en: string }
  type:
    | 'text' | 'date' | 'number' | 'richtext' | 'textarea' | 'select'
    | 'checkbox' | 'multiselect' | 'table'
  required?: boolean
  options?: string[]
  /** multiselect: key ใน meta ที่เก็บข้อความหลัง "อื่นๆ ระบุ" (โผล่เมื่อเลือก 'อื่นๆ') */
  otherKey?: string
  /** table: คอลัมน์ */
  columns?: MetaColumn[]
  /** table: แถวคงที่ — ค่าของคอลัมน์แรกถูกเติมไว้และแก้ไม่ได้ */
  fixedRows?: string[]
  /** table (ไม่มี fixedRows): จำนวนแถวสูงสุด (ค่าเริ่มต้น 5) */
  maxRows?: number
  /** หัวข้อกลุ่ม — ฟิลด์ที่ติดกันและมี section เดียวกันอยู่ใต้แถบเดียวกัน */
  section?: string
  /** คำใบ้ layout: ฟอร์มใช้กริด 6 คอลัมน์ (half=3, third=2, full=6) ค่าเริ่มต้น half */
  width?: 'half' | 'third' | 'full'
  /** ข้อความช่วยเหลือเล็กๆ ใต้ช่องกรอก */
  hint?: string
  /** แสดงเฉพาะเมื่อ meta[key] === value (ใช้กับช่อง "อื่นๆ ระบุ" ของ select) */
  showWhen?: { key: string; value: string }
}

/** จัดฟิลด์ที่ติดกันและมี section เดียวกันเป็นกลุ่ม — ฟอร์ม / มุมมองอ่าน / PDF ใช้ร่วมกัน */
export function groupMetaFields(fields: MetaField[]): { section?: string; fields: MetaField[] }[] {
  const out: { section?: string; fields: MetaField[] }[] = []
  for (const f of fields) {
    const last = out[out.length - 1]
    if (last && last.section === f.section) last.fields.push(f)
    else out.push({ section: f.section, fields: [f] })
  }
  return out
}

/** true = ยังไม่ได้กรอก (ใช้ทั้ง validateForIssue ฝั่ง server และ client) */
export function isMetaEmpty(f: MetaField, v: unknown): boolean {
  switch (f.type) {
    case 'checkbox':    return v !== true
    case 'multiselect': return !Array.isArray(v) || v.length === 0
    case 'table':
      return !Array.isArray(v) || !v.some(
        r => r && typeof r === 'object' &&
          Object.values(r as Record<string, unknown>).some(c => String(c ?? '').trim() !== '')
      )
    case 'richtext':    return isHtmlEmpty(v == null ? '' : String(v))
    default:            return v == null || String(v).trim() === ''
  }
}

/**
 * ระยะเวลาปฏิบัติงานสำหรับใบลาออก — คำนวณจาก start → end (ไม่เก็บใน meta)
 * ponytail: นับปี/เดือนแบบปฏิทิน ไม่ปัดเศษวัน — พอสำหรับช่อง "X ปี Y เดือน" บนกระดาษ
 */
export function calcTenure(
  start: string | null | undefined,
  end: string | null | undefined
): { years: number; months: number } | null {
  if (!start || !end) return null
  const a = new Date(start)
  const b = new Date(end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  if (b.getDate() < a.getDate()) months--
  if (months < 0) months = 0
  return { years: Math.floor(months / 12), months: months % 12 }
}

export interface DocTypeDef {
  code: DocTypeCode
  label: { th: string; en: string }
  party: PartyKind
  hasItems: boolean
  hasAmounts: boolean
  requiresApproval: boolean
  counter: 'monthly' | 'yearly'
  refTypes: DocTypeCode[]
  refRequired?: boolean
  /** false = ปิดใช้งานชั่วคราว (ซ่อน/ปฏิเสธตอนสร้าง) — กลุ่มการเงินปิดรอปรับปรุง 2026-08-27 */
  enabled?: boolean
  metaFields: MetaField[]
}

export const PARTY_LABEL: Record<PartyKind, { th: string; en: string }> = {
  customer:  { th: 'ลูกค้า',    en: 'Customer' },
  vendor:    { th: 'ผู้ขาย',    en: 'Vendor' },
  applicant: { th: 'ผู้สมัคร',  en: 'Applicant' },
  employee:  { th: 'พนักงาน',  en: 'Employee' },
  none:      { th: '—',        en: '—' },
}

export const DOC_TYPES: Record<DocTypeCode, DocTypeDef> = {
  QT: {
    enabled: false, code: 'QT', label: { th: 'ใบเสนอราคา', en: 'Quotation' },
    party: 'customer', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'monthly',
    refTypes: [],
    metaFields: [
      { key: 'expiry_date', label: { th: 'วันหมดอายุ', en: 'Valid until' }, type: 'date' },
    ],
  },
  JO: {
    enabled: false, code: 'JO', label: { th: 'ใบสั่งจ้าง/ยืนยันงาน', en: 'Job Order' },
    party: 'customer', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'monthly',
    refTypes: ['QT'],
    metaFields: [
      { key: 'event_date',     label: { th: 'วันงาน',    en: 'Event date' },     type: 'date' },
      { key: 'event_location', label: { th: 'สถานที่',   en: 'Location' },       type: 'text' },
      { key: 'team',           label: { th: 'ทีมงาน',    en: 'Team' },           type: 'text' },
    ],
  },
  IV: {
    enabled: false, code: 'IV', label: { th: 'ใบแจ้งหนี้', en: 'Invoice' },
    party: 'customer', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'monthly',
    refTypes: ['QT'],
    metaFields: [
      { key: 'due_date', label: { th: 'ครบกำหนดชำระ', en: 'Due date' }, type: 'date' },
    ],
  },
  TX: {
    enabled: false, code: 'TX', label: { th: 'ใบกำกับภาษี', en: 'Tax Invoice' },
    party: 'customer', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'yearly',
    refTypes: ['IV', 'RC'],
    metaFields: [],
  },
  RC: {
    enabled: false, code: 'RC', label: { th: 'ใบเสร็จรับเงิน', en: 'Receipt' },
    party: 'customer', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'yearly',
    refTypes: ['IV'],
    metaFields: [
      { key: 'payment_method', label: { th: 'วิธีชำระ', en: 'Payment method' }, type: 'select', options: ['โอนเงิน', 'เงินสด', 'เช็ค', 'บัตรเครดิต'] },
    ],
  },
  CN: {
    enabled: false, code: 'CN', label: { th: 'ใบลดหนี้', en: 'Credit Note' },
    party: 'customer', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'yearly',
    refTypes: ['QT', 'IV', 'TX', 'RC'], refRequired: true,
    metaFields: [
      { key: 'reason', label: { th: 'เหตุผล', en: 'Reason' }, type: 'textarea', required: true },
    ],
  },
  PO: {
    enabled: false, code: 'PO', label: { th: 'ใบสั่งซื้อ', en: 'Purchase Order' },
    party: 'vendor', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'monthly',
    refTypes: [],
    metaFields: [
      { key: 'delivery_date', label: { th: 'วันส่งมอบ', en: 'Delivery date' }, type: 'date' },
    ],
  },
  CT: {
    enabled: false, code: 'CT', label: { th: 'สัญญาจ้าง', en: 'Contract' },
    party: 'customer', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'monthly',
    refTypes: [],
    metaFields: [
      { key: 'body', label: { th: 'เนื้อหาสัญญา', en: 'Contract body' }, type: 'richtext' },
    ],
  },
  DN: {
    code: 'DN', label: { th: 'ใบส่งมอบงาน', en: 'Delivery Note' },
    party: 'customer', hasItems: true, hasAmounts: false, requiresApproval: false, counter: 'monthly',
    refTypes: ['JO'],
    metaFields: [],
  },
  MM: {
    code: 'MM', label: { th: 'บันทึกข้อความ', en: 'Memo' },
    party: 'none', hasItems: false, hasAmounts: false, requiresApproval: false, counter: 'monthly',
    refTypes: [],
    metaFields: [
      { key: 'subject', label: { th: 'เรื่อง',   en: 'Subject' }, type: 'text', required: true },
      { key: 'to',      label: { th: 'ถึง',      en: 'To' },      type: 'text', required: true },
      { key: 'body',    label: { th: 'เนื้อหา',  en: 'Body' },    type: 'richtext' },
    ],
  },
  // ── HR — ตรงกับแบบฟอร์มกระดาษของบริษัท (docs/document/template/*.pdf) ──────
  JA: {
    code: 'JA', label: { th: 'ใบสมัครงาน', en: 'Application for Employment' },
    party: 'applicant', hasItems: false, hasAmounts: false, requiresApproval: false, counter: 'monthly',
    refTypes: [],
    metaFields: [
      // 1. ตำแหน่งที่สมัคร
      { section: '1. ตำแหน่งที่สมัคร / Position Applied', key: 'position', label: { th: 'ตำแหน่งที่สมัคร', en: 'Position applied' }, type: 'text', required: true, width: 'third' },
      { section: '1. ตำแหน่งที่สมัคร / Position Applied', key: 'expected_salary', label: { th: 'เงินเดือนที่ต้องการ (บาท)', en: 'Expected salary (THB)' }, type: 'number', width: 'third' },
      { section: '1. ตำแหน่งที่สมัคร / Position Applied', key: 'available_date', label: { th: 'วันที่พร้อมเริ่มงาน', en: 'Available from' }, type: 'date', width: 'third' },
      // 2. ข้อมูลส่วนตัว
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'name_en', label: { th: 'ชื่อ - นามสกุล (ภาษาอังกฤษ)', en: 'Full name (English)' }, type: 'text' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'nickname', label: { th: 'ชื่อเล่น', en: 'Nickname' }, type: 'text', width: 'third' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'age', label: { th: 'อายุ (ปี)', en: 'Age' }, type: 'number', width: 'third' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'nationality', label: { th: 'สัญชาติ', en: 'Nationality' }, type: 'text', width: 'third' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'religion', label: { th: 'ศาสนา', en: 'Religion' }, type: 'text', width: 'third' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'height_cm', label: { th: 'ส่วนสูง (ซม.)', en: 'Height (cm)' }, type: 'number', width: 'third' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'weight_kg', label: { th: 'น้ำหนัก (กก.)', en: 'Weight (kg)' }, type: 'number', width: 'third' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'line_id', label: { th: 'Line ID', en: 'Line ID' }, type: 'text', width: 'third' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'marital_status', label: { th: 'สถานภาพสมรส', en: 'Marital status' }, type: 'select', options: ['โสด', 'สมรส', 'หย่าร้าง', 'หม้าย'] },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'military_status', label: { th: 'สถานภาพทางทหาร (เพศชาย)', en: 'Military status (male)' }, type: 'select', options: ['ได้รับการยกเว้น', 'ผ่านการเกณฑ์ทหารแล้ว', 'ยังไม่ได้เกณฑ์', 'ไม่เกี่ยวข้อง'] },
      // 3. ประวัติการศึกษา
      {
        section: '3. ประวัติการศึกษา / Education Background',
        key: 'education', label: { th: 'ประวัติการศึกษา', en: 'Education background' }, type: 'table', width: 'full',
        columns: [
          { key: 'level', label: 'ระดับการศึกษา' },
          { key: 'institution', label: 'สถาบันการศึกษา' },
          { key: 'major', label: 'สาขาวิชา / คณะ' },
          { key: 'grad_year', label: 'ปีที่จบ' },
          { key: 'gpa', label: 'เกรดเฉลี่ย' },
        ],
        fixedRows: ['มัธยมศึกษา', 'ปวช. / ปวส.', 'ปริญญาตรี', 'ปริญญาโท / อื่นๆ'],
      },
      // 4. ความสามารถพิเศษ
      { section: '4. ความสามารถพิเศษ / Skills', key: 'languages', label: { th: 'ภาษาต่างประเทศ (ระบุระดับ)', en: 'Languages' }, type: 'text' },
      { section: '4. ความสามารถพิเศษ / Skills', key: 'computer_skills', label: { th: 'คอมพิวเตอร์ / โปรแกรมที่ใช้ได้', en: 'Computer skills' }, type: 'text' },
      { section: '4. ความสามารถพิเศษ / Skills', key: 'driving_license', label: { th: 'ใบอนุญาตขับขี่ / พาหนะส่วนตัว', en: 'Driving license / vehicle' }, type: 'text' },
      { section: '4. ความสามารถพิเศษ / Skills', key: 'other_skills', label: { th: 'ความสามารถพิเศษอื่นๆ', en: 'Other skills' }, type: 'text' },
      // 5. ประวัติการทำงาน
      {
        section: '5. ประวัติการทำงาน / Work Experience',
        key: 'work_experience', label: { th: 'ประวัติการทำงาน', en: 'Work experience' }, type: 'table', width: 'full', maxRows: 3,
        columns: [
          { key: 'company', label: 'ชื่อบริษัท' },
          { key: 'position', label: 'ตำแหน่ง' },
          { key: 'duration', label: 'ระยะเวลาทำงาน' },
          { key: 'last_salary', label: 'เงินเดือนล่าสุด' },
          { key: 'reason_left', label: 'สาเหตุที่ออก' },
        ],
      },
      // 6. บุคคลอ้างอิง
      { section: '6. บุคคลอ้างอิง / กรณีฉุกเฉิน', key: 'emergency_name', label: { th: 'ชื่อบุคคลที่ติดต่อได้กรณีฉุกเฉิน', en: 'Emergency contact' }, type: 'text', width: 'third' },
      { section: '6. บุคคลอ้างอิง / กรณีฉุกเฉิน', key: 'emergency_relation', label: { th: 'ความสัมพันธ์', en: 'Relationship' }, type: 'text', width: 'third' },
      { section: '6. บุคคลอ้างอิง / กรณีฉุกเฉิน', key: 'emergency_phone', label: { th: 'เบอร์โทรศัพท์', en: 'Phone' }, type: 'text', width: 'third' },
      // 7. PDPA
      {
        section: '7. นโยบายความเป็นส่วนตัวและความยินยอมในการเก็บรวบรวมข้อมูลส่วนบุคคล (PDPA)',
        key: 'pdpa_consent', type: 'checkbox', required: true, width: 'full',
        label: {
          th: 'ข้าพเจ้าได้อ่านและรับทราบนโยบายความเป็นส่วนตัวข้างต้นแล้ว และให้ความยินยอมให้บริษัทเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลของข้าพเจ้าเพื่อวัตถุประสงค์ในการพิจารณาสมัครงานตามที่ระบุไว้',
          en: 'I have read and accept the privacy notice and consent to the processing of my personal data for recruitment purposes.',
        },
        hint: 'หากท่านไม่ให้ความยินยอม บริษัทอาจไม่สามารถพิจารณาใบสมัครงานของท่านได้',
      },
    ],
  },
  IA: {
    code: 'IA', label: { th: 'ใบสมัครนักศึกษาฝึกงาน', en: 'Student Internship Application Form' },
    party: 'applicant', hasItems: false, hasAmounts: false, requiresApproval: false, counter: 'monthly',
    refTypes: [],
    metaFields: [
      // 1. ตำแหน่ง / สายงาน
      { section: '1. ตำแหน่ง / สายงานที่ต้องการฝึกงาน', key: 'position', label: { th: 'ตำแหน่ง / แผนกที่ต้องการฝึกงาน', en: 'Internship position / department' }, type: 'text', required: true },
      { section: '1. ตำแหน่ง / สายงานที่ต้องการฝึกงาน', key: 'intern_start', label: { th: 'วันเริ่ม', en: 'Start date' }, type: 'date', required: true, width: 'third' },
      { section: '1. ตำแหน่ง / สายงานที่ต้องการฝึกงาน', key: 'intern_end', label: { th: 'วันสิ้นสุด', en: 'End date' }, type: 'date', required: true, width: 'third' },
      { section: '1. ตำแหน่ง / สายงานที่ต้องการฝึกงาน', key: 'required_hours', label: { th: 'จำนวนวัน/ชั่วโมงฝึกงานที่สถานศึกษากำหนด', en: 'Required days / hours' }, type: 'text', width: 'third' },
      { section: '1. ตำแหน่ง / สายงานที่ต้องการฝึกงาน', key: 'work_days', label: { th: 'วันที่สะดวกมาฝึกงาน (เช่น จันทร์-ศุกร์ / เว้นวันเรียน)', en: 'Available days' }, type: 'text' },
      // 2. ข้อมูลส่วนตัว
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'name_en', label: { th: 'ชื่อ - นามสกุล (ภาษาอังกฤษ)', en: 'Full name (English)' }, type: 'text' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'nickname', label: { th: 'ชื่อเล่น', en: 'Nickname' }, type: 'text', width: 'third' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'age', label: { th: 'อายุ (ปี)', en: 'Age' }, type: 'number', width: 'third' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'nationality', label: { th: 'สัญชาติ', en: 'Nationality' }, type: 'text', width: 'third' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'blood_type', label: { th: 'หมู่เลือด', en: 'Blood type' }, type: 'text', width: 'third' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'medical_condition', label: { th: 'โรคประจำตัว / ข้อจำกัดด้านสุขภาพ (ถ้ามี)', en: 'Medical condition' }, type: 'text' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'vehicle', label: { th: 'ยานพาหนะที่ใช้เดินทางมาทำงาน', en: 'Vehicle' }, type: 'text' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'student_insurance', label: { th: 'ประกันอุบัติเหตุจากสถานศึกษา', en: 'Accident insurance from institution' }, type: 'select', options: ['มี', 'ไม่มี'], width: 'third' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'insurance_company', label: { th: 'บริษัทประกัน / เลขที่กรมธรรม์ (ถ้ามี)', en: 'Insurer / policy no.' }, type: 'text' },
      { section: '2. ข้อมูลส่วนตัว / Personal Information', key: 'line_id', label: { th: 'Line ID', en: 'Line ID' }, type: 'text', width: 'third' },
      // 3. ข้อมูลการศึกษา
      { section: '3. ข้อมูลการศึกษา / Education Information', key: 'institution', label: { th: 'สถานศึกษา', en: 'Institution' }, type: 'text', required: true, width: 'third' },
      { section: '3. ข้อมูลการศึกษา / Education Information', key: 'faculty', label: { th: 'คณะ', en: 'Faculty' }, type: 'text', width: 'third' },
      { section: '3. ข้อมูลการศึกษา / Education Information', key: 'major', label: { th: 'สาขาวิชา / ภาควิชา', en: 'Major / department' }, type: 'text', width: 'third' },
      { section: '3. ข้อมูลการศึกษา / Education Information', key: 'year_level', label: { th: 'ชั้นปีที่กำลังศึกษา', en: 'Year level' }, type: 'text', width: 'third' },
      { section: '3. ข้อมูลการศึกษา / Education Information', key: 'student_id', label: { th: 'รหัสนักศึกษา', en: 'Student ID' }, type: 'text', width: 'third' },
      { section: '3. ข้อมูลการศึกษา / Education Information', key: 'gpax', label: { th: 'เกรดเฉลี่ยสะสม (GPAX)', en: 'GPAX' }, type: 'number', width: 'third' },
      { section: '3. ข้อมูลการศึกษา / Education Information', key: 'advisor', label: { th: 'ชื่ออาจารย์ที่ปรึกษา / ผู้ประสานงานฝึกงาน', en: 'Advisor / coordinator' }, type: 'text' },
      { section: '3. ข้อมูลการศึกษา / Education Information', key: 'advisor_contact', label: { th: 'เบอร์โทรศัพท์ / อีเมลติดต่ออาจารย์', en: 'Advisor contact' }, type: 'text' },
      {
        section: '3. ข้อมูลการศึกษา / Education Information',
        key: 'evaluation_format', label: { th: 'รูปแบบการประเมินผลที่สถานศึกษาต้องการ', en: 'Required evaluation format' },
        type: 'multiselect', width: 'full', otherKey: 'evaluation_other',
        options: ['ส่งแบบประเมินผลกลับสถานศึกษา', 'อาจารย์นิเทศเข้าเยี่ยมชม', 'ส่งรายงาน/สรุปผลการฝึกงาน', 'อื่นๆ'],
      },
      // 4. ความสามารถและทักษะ
      { section: '4. ความสามารถและทักษะ / Skills', key: 'languages', label: { th: 'ภาษาต่างประเทศ (ระบุระดับ)', en: 'Languages' }, type: 'text' },
      { section: '4. ความสามารถและทักษะ / Skills', key: 'computer_skills', label: { th: 'คอมพิวเตอร์ / โปรแกรมที่ใช้ได้', en: 'Computer skills' }, type: 'text' },
      { section: '4. ความสามารถและทักษะ / Skills', key: 'activities', label: { th: 'ผลงาน / กิจกรรม / โครงการที่เคยทำ', en: 'Portfolio / activities / projects' }, type: 'textarea', width: 'full' },
      { section: '4. ความสามารถและทักษะ / Skills', key: 'motivation', label: { th: 'เหตุผลที่สนใจฝึกงานกับบริษัท', en: 'Motivation' }, type: 'textarea', width: 'full' },
      // 5. เอกสารประกอบ
      {
        section: '5. เอกสารประกอบการสมัคร',
        key: 'attached_docs', label: { th: 'เอกสารประกอบการสมัคร', en: 'Attached documents' },
        type: 'multiselect', width: 'full', otherKey: 'attached_other',
        options: ['สำเนาบัตรประจำตัวนักศึกษา', 'สำเนาบัตรประชาชน', 'Transcript', 'หนังสือขอความอนุเคราะห์รับนักศึกษาฝึกงาน', 'รูปถ่าย 1 นิ้ว', 'Portfolio / ผลงาน (ถ้ามี)', 'อื่นๆ'],
      },
      // 6. บุคคลที่ติดต่อได้กรณีฉุกเฉิน
      { section: '6. บุคคลที่ติดต่อได้กรณีฉุกเฉิน', key: 'emergency_name', label: { th: 'ชื่อ-นามสกุล', en: 'Emergency contact' }, type: 'text', width: 'third' },
      { section: '6. บุคคลที่ติดต่อได้กรณีฉุกเฉิน', key: 'emergency_relation', label: { th: 'ความสัมพันธ์', en: 'Relationship' }, type: 'text', width: 'third' },
      { section: '6. บุคคลที่ติดต่อได้กรณีฉุกเฉิน', key: 'emergency_phone', label: { th: 'เบอร์โทรศัพท์', en: 'Phone' }, type: 'text', width: 'third' },
      // 7. PDPA
      {
        section: '7. นโยบายความเป็นส่วนตัวและความยินยอมในการเก็บรวบรวมข้อมูลส่วนบุคคล (PDPA)',
        key: 'pdpa_consent', type: 'checkbox', required: true, width: 'full',
        label: {
          th: 'ข้าพเจ้าได้อ่านและรับทราบนโยบายความเป็นส่วนตัวข้างต้นแล้ว และให้ความยินยอมให้บริษัทเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลของข้าพเจ้าเพื่อวัตถุประสงค์ในการพิจารณารับนักศึกษาฝึกงานตามที่ระบุไว้',
          en: 'I have read and accept the privacy notice and consent to the processing of my personal data for internship purposes.',
        },
        hint: 'หากท่านไม่ให้ความยินยอม บริษัทอาจไม่สามารถพิจารณาใบสมัครฝึกงานของท่านได้',
      },
      // 8. คำรับรองผู้สมัคร
      {
        section: '8. คำรับรองผู้สมัคร',
        key: 'under_20', type: 'checkbox', width: 'full',
        label: {
          th: 'ข้าพเจ้ามีอายุต่ำกว่า 20 ปีบริบูรณ์ ณ วันที่สมัคร จึงได้แนบความยินยอมของผู้ปกครองไว้ท้ายเอกสารนี้แล้ว',
          en: 'I am under 20 years old on the application date and have attached my guardian consent.',
        },
      },
      // 9. ความยินยอมของผู้ปกครอง
      { section: '9. ความยินยอมของผู้ปกครอง (กรณีนักศึกษาอายุต่ำกว่า 20 ปีบริบูรณ์)', key: 'guardian_name', label: { th: 'ชื่อ-นามสกุลผู้ปกครอง', en: 'Guardian name' }, type: 'text', width: 'third' },
      { section: '9. ความยินยอมของผู้ปกครอง (กรณีนักศึกษาอายุต่ำกว่า 20 ปีบริบูรณ์)', key: 'guardian_relation', label: { th: 'ความสัมพันธ์กับผู้สมัคร', en: 'Relationship to applicant' }, type: 'text', width: 'third' },
      { section: '9. ความยินยอมของผู้ปกครอง (กรณีนักศึกษาอายุต่ำกว่า 20 ปีบริบูรณ์)', key: 'guardian_phone', label: { th: 'เบอร์โทรศัพท์', en: 'Phone' }, type: 'text', width: 'third' },
    ],
  },
  RS: {
    code: 'RS', label: { th: 'ใบลาออก', en: 'Resignation Form' },
    party: 'employee', hasItems: false, hasAmounts: false, requiresApproval: true, counter: 'monthly',
    refTypes: [],
    metaFields: [
      // ข้อมูลพนักงาน — "รวมระยะเวลาปฏิบัติงาน" คำนวณจาก start_date → last_working_day (ไม่เก็บ)
      { section: 'ข้อมูลพนักงาน', key: 'position', label: { th: 'ตำแหน่ง', en: 'Position' }, type: 'text', required: true, width: 'third' },
      { section: 'ข้อมูลพนักงาน', key: 'department', label: { th: 'สังกัดแผนก/ฝ่าย', en: 'Department' }, type: 'text', required: true, width: 'third' },
      { section: 'ข้อมูลพนักงาน', key: 'employee_id', label: { th: 'รหัสพนักงาน', en: 'Employee ID' }, type: 'text', width: 'third' },
      { section: 'ข้อมูลพนักงาน', key: 'last_working_day', label: { th: 'วันที่การลาออกมีผล (วันทำงานสุดท้าย)', en: 'Effective date (last working day)' }, type: 'date', required: true, width: 'third' },
      { section: 'ข้อมูลพนักงาน', key: 'start_date', label: { th: 'เริ่มปฏิบัติงานเมื่อ', en: 'Employment start date' }, type: 'date', width: 'third' },
      // เหตุผล
      {
        section: 'เหตุผลในการลาออก',
        key: 'reason', label: { th: 'เหตุผลในการลาออก', en: 'Reason for resignation' }, type: 'select', required: true, width: 'full',
        options: ['เปลี่ยนงาน / ย้ายที่ทำงานใหม่', 'ศึกษาต่อ', 'เหตุผลด้านสุขภาพ', 'เหตุผลส่วนตัว / ครอบครัว', 'ย้ายภูมิลำเนา', 'อื่นๆ'],
      },
      { section: 'เหตุผลในการลาออก', key: 'reason_other', label: { th: 'อื่นๆ ระบุ', en: 'Other (specify)' }, type: 'text', width: 'full', showWhen: { key: 'reason', value: 'อื่นๆ' } },
      // ส่งมอบงาน
      { section: 'การส่งมอบงานและทรัพย์สินของบริษัท', key: 'handover_to', label: { th: 'ผู้รับมอบงานต่อ (ชื่อ-ตำแหน่ง)', en: 'Handover to (name - position)' }, type: 'text', width: 'full' },
      { section: 'การส่งมอบงานและทรัพย์สินของบริษัท', key: 'handover_date', label: { th: 'วันที่ส่งมอบงานแล้วเสร็จ', en: 'Handover completion date' }, type: 'date', width: 'third' },
      { section: 'การส่งมอบงานและทรัพย์สินของบริษัท', key: 'assets_returned', label: { th: 'ทรัพย์สินที่คืนบริษัท (บัตรพนักงาน, อุปกรณ์, เอกสาร ฯลฯ)', en: 'Company assets returned' }, type: 'textarea', width: 'full' },
    ],
  },
  SC: {
    code: 'SC', label: { th: 'หนังสือรับรองเงินเดือน', en: 'Salary Certificate' },
    party: 'employee', hasItems: false, hasAmounts: false, requiresApproval: true, counter: 'monthly',
    refTypes: [],
    metaFields: [
      // ข้อมูลพนักงาน — เติมจากตั้งค่าเงินเดือน (salary_profiles) + โปรไฟล์ ไม่ให้พนักงานแก้เอง
      { section: 'ข้อมูลพนักงาน', key: 'position', label: { th: 'ตำแหน่ง', en: 'Position' }, type: 'text', required: true, width: 'third' },
      { section: 'ข้อมูลพนักงาน', key: 'department', label: { th: 'แผนก/ฝ่าย', en: 'Department' }, type: 'text', width: 'third' },
      { section: 'ข้อมูลพนักงาน', key: 'start_date', label: { th: 'วันเริ่มปฏิบัติงาน', en: 'Employment start date' }, type: 'date', required: true, width: 'third' },
      { section: 'ข้อมูลพนักงาน', key: 'base_salary', label: { th: 'เงินเดือน (บาท/เดือน)', en: 'Monthly salary (THB)' }, type: 'number', required: true, width: 'third' },
      // วัตถุประสงค์ — ผู้ขอกรอกเองได้เสมอ
      { section: 'วัตถุประสงค์', key: 'purpose', label: { th: 'วัตถุประสงค์', en: 'Purpose' }, type: 'text', required: true, width: 'full', hint: 'เช่น ยื่นขอสินเชื่อกับธนาคาร, ยื่นขอวีซ่า, ใช้เป็นหลักฐานประกอบการสมัครเรียน' },
    ],
  },
}

// ── SC — ฟิลด์ที่ระบบเป็นคนเติม ไม่ใช่ผู้ขอ ──────────────────────────────────
// พนักงานออกหนังสือรับรองเงินเดือนให้ตัวเองได้ แต่ต้องรับรอง "ตัวเลขของบริษัท"
// ไม่ใช่ตัวเลขที่พิมพ์เอง — สองรายการนี้จึงเป็นแหล่งความจริงเดียวของทั้ง
// ยามฝั่ง server (actions.ts::saveDraft) และช่องที่ล็อกไว้ในฟอร์ม (document-form.tsx)
// admin แก้ได้ตามปกติ (เช่น ออกให้พนักงานที่ข้อมูลยังไม่ครบ)

/** คอลัมน์ party_* ของ SC ที่ derive จาก profiles ของเจ้าของเอกสาร */
// party_email / party_birth_date ไม่อยู่ในนี้ — profiles ไม่มีข้อมูล จึงให้กรอกเองได้ (ไม่ถูกทับเป็น null ตอนบันทึก)
export const SC_LOCKED_PARTY_KEYS = [
  'party_name', 'party_id_card', 'party_address', 'party_phone',
] as const

/** คีย์ใน meta ของ SC ที่ derive จาก salary_profiles + profiles (นอกนั้น = purpose ผู้ขอกรอกเอง) */
export const SC_LOCKED_META_KEYS = ['position', 'department', 'start_date', 'base_salary'] as const

// ── HTML (richtext meta) ─────────────────────────────────────────────────────
// ponytail: HTML ในฟิลด์ richtext มาจาก TipTap ของเราเอง (ไม่มี script/on* อยู่แล้ว)
// ตัวนี้เป็นแค่ยามที่ trust boundary — regex 3 บรรทัด พอสำหรับสิ่งที่เรา render เอง
// ไม่ใช่ sanitizer ทั่วไป ถ้าวันไหนรับ HTML จากภายนอกจริงๆ ให้เปลี่ยนไปใช้ DOMPurify

export function sanitizeHtml(html: string): string {
  return String(html)
    .replace(/<\s*\/?\s*(script|iframe|object|embed|style|link|meta)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]*)/gi, '')
}

/**
 * ล้าง string ทุกตัวใน meta ก่อนบันทึกลง DB
 * boolean (checkbox) / array (multiselect, table) / object (แถวตาราง) ผ่านได้
 * โดยลงไปล้าง string ข้างในให้ด้วย
 */
function sanitizeValue(v: unknown): unknown {
  if (typeof v === 'string') return sanitizeHtml(v)
  if (Array.isArray(v)) return v.map(sanitizeValue)
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = sanitizeValue(val)
    return o
  }
  return v
}

export function sanitizeMeta(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return sanitizeValue(meta || {}) as Record<string, unknown>
}

/** true เมื่อ HTML ไม่มีเนื้อความจริง (TipTap คืน '<p></p>' ตอนว่าง) */
export function isHtmlEmpty(html: string | null | undefined): boolean {
  return !String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

// ── State machine ────────────────────────────────────────────────────────────

export type DocAction = 'submit' | 'approve' | 'reject' | 'issue' | 'void' | 'mark_sent' | 'close'

export interface TransitionDef {
  from: DocStatus[]
  to: DocStatus
  adminOnly: boolean
  requiresNote?: boolean
}

export const TRANSITIONS: Record<DocAction, TransitionDef> = {
  submit:    { from: ['draft', 'rejected'],   to: 'pending_approval', adminOnly: false },
  approve:   { from: ['pending_approval'],    to: 'issued',           adminOnly: true },
  reject:    { from: ['pending_approval'],    to: 'rejected',         adminOnly: true, requiresNote: true },
  issue:     { from: ['draft', 'rejected'],   to: 'issued',           adminOnly: false },
  void:      { from: ['issued', 'sent'],      to: 'void',             adminOnly: true, requiresNote: true },
  mark_sent: { from: ['issued'],              to: 'sent',             adminOnly: false },
  close:     { from: ['sent'],                to: 'closed',           adminOnly: false },
}

/** transition ที่เจ้าของเอกสารทำเองได้ (นอกนั้นดูที่ adminOnly) */
const OWNER_ACTIONS: DocAction[] = ['submit', 'mark_sent', 'close']

export type TransitionCheck = { ok: true } | { ok: false; reason: string }

/**
 * แหล่งความจริงเดียวว่า transition นี้ทำได้ไหม — ทั้งฝั่ง server (actions.ts)
 * และฝั่ง client (ปุ่มใน document-view.tsx) เรียกตัวเดียวกัน
 * หมายเหตุ: ไม่ตรวจ requiresNote ที่นี่ (ต้องดู note ที่ผู้เรียกส่งมา)
 */
export function canTransition(
  action: DocAction,
  doc: { status: DocStatus; doc_type: DocTypeCode; created_by: string | null },
  role: string | undefined,
  userId: string | undefined,
): TransitionCheck {
  const def = TRANSITIONS[action]
  if (!def) return { ok: false, reason: 'การกระทำไม่ถูกต้อง' }

  const typeDef = DOC_TYPES[doc.doc_type]
  if (!typeDef) return { ok: false, reason: 'ประเภทเอกสารไม่ถูกต้อง' }

  const isAdmin = role === 'admin'
  const isOwner = !!userId && doc.created_by === userId

  if (!def.from.includes(doc.status)) return { ok: false, reason: 'สถานะปัจจุบันไม่อนุญาตให้ทำรายการนี้' }
  if (def.adminOnly && !isAdmin) return { ok: false, reason: 'เฉพาะ admin เท่านั้นที่ทำรายการนี้ได้' }
  if (OWNER_ACTIONS.includes(action) && !isAdmin && !isOwner) return { ok: false, reason: 'ไม่มีสิทธิ์ทำรายการนี้' }

  if (action === 'submit' && !typeDef.requiresApproval) {
    return { ok: false, reason: 'เอกสารประเภทนี้ไม่ต้องขออนุมัติ — ใช้ปุ่มออกเอกสารแทน' }
  }
  if (action === 'issue' && typeDef.requiresApproval) {
    return { ok: false, reason: 'เอกสารประเภทนี้ต้องผ่านการอนุมัติก่อน' }
  }
  if (action === 'approve' && !typeDef.requiresApproval) {
    return { ok: false, reason: 'เอกสารประเภทนี้ไม่ต้องอนุมัติ — ใช้ปุ่มออกเอกสารแทน' }
  }

  return { ok: true }
}

// ── การคำนวณยอด (pure) ───────────────────────────────────────────────────────

export type VatMode = 'none' | 'exclusive' | 'inclusive'

export interface DocumentItemInput {
  quantity?: number | null
  unit_price?: number | null
  discount?: number | null
}

export interface DocumentTotals {
  subtotal: number
  discount_total: number
  vat_amount: number
  wht_amount: number
  total: number
  net_payable: number
}

const VAT_RATE = 0.07
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * exclusive: VAT 7% บวกนอกจากยอดหลังส่วนลด
 * inclusive: ยอดที่กรอกรวม VAT แล้ว → ฐาน = ยอด / 1.07
 * WHT คิดจากฐานก่อน VAT เสมอ, net_payable = total − wht
 */
export function calcDocumentTotals(
  items: DocumentItemInput[],
  vatMode: VatMode,
  whtRate: number
): DocumentTotals {
  let gross = 0
  let discount_total = 0
  for (const it of items || []) {
    const qty = Number(it.quantity ?? 0)
    const price = Number(it.unit_price ?? 0)
    const disc = Number(it.discount ?? 0)
    gross += qty * price
    discount_total += disc
  }
  const afterDiscount = gross - discount_total

  let base: number
  let vat_amount: number
  if (vatMode === 'exclusive') {
    base = afterDiscount
    vat_amount = base * VAT_RATE
  } else if (vatMode === 'inclusive') {
    base = afterDiscount / (1 + VAT_RATE)
    vat_amount = afterDiscount - base
  } else {
    base = afterDiscount
    vat_amount = 0
  }

  const total = vatMode === 'exclusive' ? base + vat_amount : afterDiscount
  const wht_amount = base * (Number(whtRate || 0) / 100)

  return {
    subtotal: round2(gross),
    discount_total: round2(discount_total),
    vat_amount: round2(vat_amount),
    wht_amount: round2(wht_amount),
    total: round2(total),
    net_payable: round2(total - wht_amount),
  }
}

/** จำนวนเงินต่อรายการ (ใช้ตอนบันทึกลง document_items.amount) */
export function calcItemAmount(it: DocumentItemInput): number {
  return round2(Number(it.quantity ?? 0) * Number(it.unit_price ?? 0) - Number(it.discount ?? 0))
}

// ── Row types ────────────────────────────────────────────────────────────────
// ponytail: ตารางชุดนี้ยังไม่อยู่ใน types/database.types.ts (ต้องใช้ supabase CLI gen)
// จึงประกาศ shape แบบเบาๆ ไว้ที่นี่แล้ว cast ใน actions — pattern เดียวกับ crm_leads

export interface DocBrandRow {
  code: string
  name_th: string
  name_en: string | null
  address: string | null
  tax_id: string | null
  branch: string | null
  phone: string | null
  email: string | null
  website: string | null
  logo_url: string | null
  vat_registered: boolean
  default_vat_mode: VatMode
  default_wht_rate: number
  is_active: boolean
  sort_order: number
}

export interface DocumentItemRow {
  id: string
  document_id: string
  line_no: number
  description: string | null
  quantity: number
  unit: string | null
  unit_price: number
  discount: number
  amount: number
}

export interface DocumentLogRow {
  id: string
  document_id: string
  action: string
  from_status: string | null
  to_status: string | null
  changed_by: string | null
  note: string | null
  self_approved: boolean
  created_at: string
  changer?: { id: string; full_name: string | null } | null
}

export interface DocTemplateRow {
  id: string
  brand_code: string
  doc_type: string
  version: number
  title: string | null
  terms: string | null
  footer: string | null
  signer_label_1: string | null
  signer_label_2: string | null
  payment_info: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
}

export interface DocumentRow {
  id: string
  draft_no: string
  doc_no: string | null
  brand_code: string
  doc_type: DocTypeCode
  status: DocStatus
  template_version_id: string | null
  party_name: string | null
  party_company: string | null
  party_tax_id: string | null
  party_address: string | null
  party_phone: string | null
  party_email: string | null
  party_id_card: string | null
  party_birth_date: string | null
  doc_date: string | null
  meta: Record<string, unknown>
  vat_mode: VatMode
  wht_rate: number
  subtotal: number
  discount_total: number
  vat_amount: number
  wht_amount: number
  total: number
  net_payable: number
  currency: string
  ref_document_id: string | null
  notes: string | null
  created_by: string | null
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  issued_at: string | null
  rejected_reason: string | null
  void_reason: string | null
  void_by: string | null
  void_at: string | null
  sent_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  creator?: { id: string; full_name: string | null } | null
}
