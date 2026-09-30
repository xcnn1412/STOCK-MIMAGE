// ============================================================================
// ตารางการเปลี่ยนสถานะใบเบิก — ที่เดียวที่บอกว่าใคร ทำอะไร จากสถานะไหน ไปสถานะไหน
// server action (lifecycle-actions.ts) และหน้าจอ (คิวใบเบิก / หน้าใบเบิก) ใช้ชุดเดียวกัน
// ห้าม import ค่าจริงจาก next/*, supabase หรือ react ที่นี่ (import type เท่านั้น): ไฟล์นี้ต้องรันได้ทั้ง server, client และในชุดตรวจ
// ข้อความ wrongStatusError ต้องตรงกับที่ action เคยคืน (ตรวจด้วย scripts/claim-lifecycle.check.ts)
// ตรวจด้วย claim-transitions.check.ts ข้างไฟล์นี้
// ============================================================================

import type { ActionType } from '@/lib/logger'
import type { ClaimStatus } from '../costs/types'

export type TransitionKey =
  | 'submit'
  | 'cancel'
  | 'approve'
  | 'approve_month_end'
  | 'reject'
  | 'send_back'
  | 'reopen'
  | 'request_tax_invoice'
  | 'defer_month_end'
  | 'pay'

export interface ClaimTransition {
  key: TransitionKey
  /** สถานะที่ทำการเปลี่ยนนี้ได้ */
  from: readonly ClaimStatus[]
  to: ClaimStatus
  /** admin = แอดมินเท่านั้น · owner = เจ้าของใบเท่านั้น */
  actor: 'admin' | 'owner'
  /** เหตุผลจากผู้กด: required = ต้องพิมพ์ · optional = เว้นว่างได้ · none = ไม่ถาม */
  reason: 'required' | 'optional' | 'none'
  /** ทำทีละหลายใบได้ (bulkClaimAction) */
  bulk: boolean
  /** ค่า action ของแถวใน expense_claim_logs */
  logAction: string
  /** ค่า action ของ activity_logs */
  activity: ActionType
  labelTh: string
  labelEn: string
  /** ข้อความเมื่อสถานะปัจจุบันไม่อยู่ใน from */
  wrongStatusError: string
}

export const CLAIM_TRANSITIONS: Readonly<Record<TransitionKey, ClaimTransition>> = {
  submit: {
    key: 'submit', from: ['draft'], to: 'pending', actor: 'owner', reason: 'none', bulk: false,
    logAction: 'submit', activity: 'SUBMIT_EXPENSE_CLAIM', labelTh: 'ยื่นใบเบิก', labelEn: 'Submit',
    wrongStatusError: 'ยื่นได้เฉพาะใบเบิกที่อยู่ในสถานะ "แบบร่าง" เท่านั้น',
  },
  cancel: {
    key: 'cancel', from: ['draft', 'pending'], to: 'cancelled', actor: 'owner', reason: 'none', bulk: false,
    logAction: 'cancel', activity: 'CANCEL_EXPENSE_CLAIM', labelTh: 'ยกเลิก', labelEn: 'Cancel',
    wrongStatusError: 'ยกเลิกได้เฉพาะใบเบิกที่อยู่ในสถานะ "แบบร่าง" หรือ "รออนุมัติ" เท่านั้น',
  },
  approve: {
    key: 'approve', from: ['pending'], to: 'approved', actor: 'admin', reason: 'none', bulk: true,
    logAction: 'approve', activity: 'APPROVE_EXPENSE_CLAIM', labelTh: 'อนุมัติ', labelEn: 'Approve',
    wrongStatusError: 'อนุมัติได้เฉพาะใบเบิกที่อยู่ในสถานะ "รออนุมัติ" เท่านั้น',
  },
  approve_month_end: {
    key: 'approve_month_end', from: ['pending'], to: 'pending_month_end', actor: 'admin', reason: 'none', bulk: true,
    logAction: 'approve_month_end', activity: 'APPROVE_EXPENSE_CLAIM_MONTH_END',
    labelTh: 'อนุมัติ — รอจ่ายสิ้นเดือน', labelEn: 'Approve — pay at month end',
    wrongStatusError: 'อนุมัติได้เฉพาะใบเบิกที่อยู่ในสถานะ "รออนุมัติ" เท่านั้น',
  },
  reject: {
    key: 'reject', from: ['pending'], to: 'rejected', actor: 'admin', reason: 'optional', bulk: false,
    logAction: 'reject', activity: 'REJECT_EXPENSE_CLAIM', labelTh: 'ปฏิเสธ', labelEn: 'Reject',
    wrongStatusError: 'ปฏิเสธได้เฉพาะใบเบิกที่อยู่ในสถานะ "รออนุมัติ" เท่านั้น',
  },
  send_back: {
    key: 'send_back', from: ['pending', 'approved', 'waiting_tax_invoice', 'pending_month_end'], to: 'draft',
    actor: 'admin', reason: 'required', bulk: false,
    logAction: 'send_back', activity: 'SEND_BACK_EXPENSE_CLAIM', labelTh: 'ส่งกลับให้แก้', labelEn: 'Send back for changes',
    wrongStatusError: 'ส่งกลับให้แก้ได้เฉพาะใบที่รออนุมัติ อนุมัติแล้ว รอใบกำกับภาษี หรือรอจ่ายสิ้นเดือน',
  },
  reopen: {
    key: 'reopen', from: ['rejected'], to: 'draft', actor: 'owner', reason: 'none', bulk: false,
    logAction: 'reopen', activity: 'REOPEN_REJECTED_CLAIM', labelTh: 'แก้ไขแล้วยื่นใหม่', labelEn: 'Edit and resubmit',
    wrongStatusError: 'เปิดกลับมาแก้ไขได้เฉพาะใบเบิกที่ถูกปฏิเสธ',
  },
  request_tax_invoice: {
    key: 'request_tax_invoice', from: ['approved'], to: 'waiting_tax_invoice', actor: 'admin', reason: 'none', bulk: true,
    logAction: 'waiting_tax_invoice', activity: 'MARK_CLAIM_WAITING_TAX_INVOICE',
    labelTh: 'ขอใบกำกับภาษี', labelEn: 'Request tax invoice',
    wrongStatusError: 'ขอใบกำกับภาษีได้เฉพาะใบเบิกที่อยู่ในสถานะ "อนุมัติแล้ว" เท่านั้น',
  },
  defer_month_end: {
    key: 'defer_month_end', from: ['approved', 'awaiting_payment', 'waiting_tax_invoice'], to: 'pending_month_end',
    actor: 'admin', reason: 'none', bulk: true,
    logAction: 'defer_month_end', activity: 'MARK_CLAIM_PENDING_MONTH_END',
    labelTh: 'ย้ายไปจ่ายสิ้นเดือน', labelEn: 'Move to month-end payment',
    wrongStatusError: 'เลื่อนจ่ายสิ้นเดือนได้เฉพาะใบเบิกที่อนุมัติแล้วเท่านั้น',
  },
  pay: {
    key: 'pay', from: ['approved', 'awaiting_payment', 'pending_month_end', 'waiting_tax_invoice'], to: 'paid',
    actor: 'admin', reason: 'none', bulk: true,
    logAction: 'mark_paid', activity: 'MARK_CLAIM_PAID', labelTh: 'จ่าย', labelEn: 'Pay',
    wrongStatusError: 'ชำระเงินได้เฉพาะใบเบิกที่อนุมัติแล้วเท่านั้น',
  },
}

/** การกระทำที่ทำทีละหลายใบได้ (คิวใบเบิก + bulkClaimAction) */
export const BULK_TRANSITIONS: readonly TransitionKey[] = ['approve', 'approve_month_end', 'request_tax_invoice', 'defer_month_end', 'pay']

/**
 * การเปลี่ยนสถานะตามชื่อ — ใส่ from แล้วสถานะนั้นทำไม่ได้ = null · ไม่ใส่ from = คืนแถวของชื่อนั้น
 * ชื่อที่ไม่รู้จัก (รวมชื่อของ Object เช่น 'constructor') = null — ชื่อมาจากผู้เรียก server action ได้
 */
export function findTransition(key: string, from?: string | null): ClaimTransition | null {
  if (!Object.prototype.hasOwnProperty.call(CLAIM_TRANSITIONS, key)) return null
  const t = CLAIM_TRANSITIONS[key as TransitionKey]
  if (from === undefined) return t
  return typeof from === 'string' && (t.from as readonly string[]).includes(from) ? t : null
}

/** การเปลี่ยนสถานะที่คนนี้ทำได้กับใบในสถานะนี้ (เรียงตามตาราง) */
export function transitionsFor(status: string, v: { isAdmin: boolean; isOwner: boolean }): ClaimTransition[] {
  return Object.values(CLAIM_TRANSITIONS).filter(t =>
    (t.from as readonly string[]).includes(status) && (t.actor === 'admin' ? v.isAdmin : v.isOwner))
}
