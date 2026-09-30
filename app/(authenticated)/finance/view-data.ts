// ============================================================================
// รูปข้อมูลที่หน้าในส่วนใบเบิกส่งจาก server ไปหน้าจอ (ขั้น 3 — ส่งเฉพาะคอลัมน์ที่หน้าจอใช้)
// ไฟล์ชนิดล้วน (+ ค่าคงที่ ARCHIVE_PAGE_SIZE): ไม่ import โค้ดฝั่ง server — client component import ได้
// ผู้สร้างข้อมูลอยู่ฝั่ง server (list-data.ts, archive-data.ts, search-data.ts, report-data.ts) · ตัวช่วยอ่าน docs อยู่ที่ claim-docs.ts
// ============================================================================

import type { ExpenseClaim } from '../costs/types'

/** จำนวนไฟล์แนบของช่องหนึ่ง: n = ความยาวรายการดิบ (นับ '' ด้วย — แบบ getClaimChecklist) · files = เฉพาะสตริงที่ไม่ว่าง (แบบ claimFileCount) */
export type DocCount = { n: number; files: number }

/** สรุปไฟล์แนบของใบเบิกแทนรายการ URL — หน้ารายการคิดป้ายเอกสาร/สถานะแฟ้มจากค่านี้ (claim-docs.ts) */
export type DocCounts = {
  receipts: DocCount
  actualReceipts: DocCount
  taxInvoices: DocCount
  refundSlips: DocCount
  /** ความยาวดิบของ tax_invoice_numbers */
  taxInvoiceNumbers: number
}

/**
 * แถวใบเบิกแบบเบาของหน้ารายการ — ไม่มีรายการ URL, รายละเอียด, หมายเหตุ, บัญชีธนาคาร, ผู้อนุมัติ, ผู้จ่าย
 * job_event เลือกมาเป็น { id, event_name, linked_lead_id }
 */
export type ListClaim = Pick<ExpenseClaim,
  | 'id' | 'claim_number' | 'claim_type' | 'title' | 'amount' | 'vat_mode' | 'withholding_tax_rate' | 'status' | 'category'
  | 'submitted_by' | 'submitted_at' | 'approved_at' | 'paid_at' | 'created_at' | 'expense_date' | 'funding_source'
  | 'job_event_id' | 'reject_reason' | 'refund_amount' | 'refund_confirmed_at' | 'actual_spent_amount' | 'advance_settled_at'
  | 'pettycash_fund_id' | 'pettycash_closed_at' | 'submitter' | 'job_event'
> & {
  filed_at: string | null
  filed_file_count: number | null
  deleted_at: string | null
  docs: DocCounts
}

/** แถวของคลังเก็บ */
export type ArchiveRow = ListClaim

/** แถวของรายงานตรวจสอบ (/finance/overview) — เพิ่มช่องที่ไฟล์ XLSX/PDF ใช้ */
export type OverviewRow = ListClaim & {
  tax_invoice_numbers: string[] | null
  notes: string | null
  staff_roles: { role: string; label: string }[] | null
}

/** ผลค้นหาหนึ่งใบ (/finance/search) */
export type SearchHit = Pick<ListClaim,
  | 'id' | 'claim_number' | 'claim_type' | 'title' | 'amount' | 'vat_mode' | 'withholding_tax_rate' | 'status'
  | 'expense_date' | 'paid_at' | 'created_at' | 'submitted_by' | 'submitter' | 'job_event'
>

/** ผลของ searchClaims — truncated = มีมากกว่าที่แสดง (ตัดที่ SEARCH_LIMIT) */
export type SearchResult = { hits: SearchHit[]; truncated: boolean }

// ── คลังเก็บ (/finance/archive) — ตัวกรองทั้งหมดอยู่ใน URL (คีย์ = ชื่อช่อง) ─────────────────────

/** จำนวนแถวต่อหน้าของคลังเก็บ */
export const ARCHIVE_PAGE_SIZE = 50

export type ArchiveQuery = {
  /** หน้า เริ่มที่ 1 */
  page: number
  /** ค้นหาเลขที่ หัวข้อ ชื่อผู้เบิก ชื่องาน */
  q: string
  /** id ผู้เบิก */
  by: string
  type: '' | 'event' | 'other' | 'advance' | 'petty_cash'
  /** หมวดหมู่ (value) */
  cat: string
  amount: '' | '0' | '1-1000' | '1001-5000' | '5001-10000' | '10001+'
  /** id งาน (job_event_id) */
  event: string
  /** เดือนที่ใช้จ่าย 'YYYY-MM' */
  month: string
  /** วันที่ใช้จ่าย 'YYYY-MM-DD' (รวมทั้งสองวัน) */
  efrom: string
  eto: string
  /** วันที่จ่ายตามเวลาไทย 'YYYY-MM-DD' (รวมทั้งสองวัน) */
  pfrom: string
  pto: string
}

export type ArchivePageData = {
  rows: ListClaim[]
  /** จำนวนใบทั้งหมดที่ผ่านตัวกรอง */
  total: number
  page: number
  pageSize: typeof ARCHIVE_PAGE_SIZE
  pages: number
  /** ยอดจ่ายจริงรวมของทุกใบที่ผ่านตัวกรอง (ไม่ใช่เฉพาะหน้านี้) */
  netTotal: number
  submitters: { id: string; name: string }[]
  events: { id: string; name: string }[]
  query: ArchiveQuery
}

// ── รายงานตรวจสอบ (/finance/overview) — ช่วงวันที่อยู่ใน URL (?preset&from&to) ─────────────────

/** 'all' = ไม่กรองวันที่ · custom ที่เว้นฝั่งใดฝั่งหนึ่ง = '0000-01-01' / '9999-12-31' */
export type OverviewRange = {
  preset: 'day' | 'week' | 'month' | 'year' | 'custom' | 'all'
  from: string
  to: string
}

// ── หัก ณ ที่จ่าย (/finance/download) — ยอดรวมต่อ (ผู้เบิก, สถานะ, เดือน) แทนแถวใบเบิก ──────────────

/**
 * ยอดรวมของใบที่มีหัก ณ ที่จ่าย (withholding_tax_rate > 0, ไม่รวมใบที่ซ่อน) หนึ่งกลุ่ม
 * month = 'YYYY-MM' ตามเวลาไทยของ expense_date (ไม่มี = created_at)
 * บัญชีธนาคาร = ค่าที่ไม่ว่างของใบที่สร้างล่าสุดในกลุ่ม พร้อมเวลาสร้างของใบนั้น (*_at) — หน้าจอเลือกค่าที่ *_at ใหม่สุด
 */
export type WhtCell = {
  submitted_by: string
  status: string
  month: string
  n: number
  gross: number
  wht: number
  net: number
  bank_name: string | null
  bank_name_at: string | null
  bank_account_number: string | null
  bank_account_number_at: string | null
  account_holder_name: string | null
  account_holder_name_at: string | null
}

/** ชื่อผู้เบิกของหน้าหัก ณ ที่จ่าย */
export type WhtPerson = { id: string; name: string }
