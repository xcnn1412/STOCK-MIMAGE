// ============================================================================
// รายการค้างเคลียร์ของผู้เบิก (ทดลองจ่ายยังไม่เคลียร์ / ยังไม่คืนเงิน / รอใบกำกับภาษี)
// ถือ service-role client → เรียกจาก server เท่านั้น · ใช้ใน layout ด้วย จึงไม่ throw (พังคืน [])
// กติกาว่าค้างอะไรอยู่ที่ claim-rules.ts::outstandingKind
// ============================================================================

import { cache } from 'react'
import { createServiceClient } from '@/lib/supabase-server'
import { outstandingKind, type OutstandingKind } from './claim-rules'

export interface OutstandingClaim {
  id: string
  claim_number: string
  title: string
  claim_type: string
  status: string
  submitted_by: string
  kind: OutstandingKind
}

const COLUMNS = 'id, claim_number, title, claim_type, status, submitted_by, advance_settled_at, refund_amount, deleted_at, created_at'

type Row = {
  id: string
  claim_number: string
  title: string
  claim_type: string
  status: string
  submitted_by: string
  advance_settled_at: string | null
  refund_amount: number | string | null
  deleted_at: string | null
  created_at: string
}

/**
 * all = ทุกผู้เบิก (แอดมิน) · ไม่งั้นเฉพาะใบของ userId
 * รับค่าเดี่ยวเพื่อให้ cache() ของ React จับคู่ได้ (object ใหม่ทุกครั้ง = ไม่เคย hit)
 * อ่านแยกสองชุดแทน .or() แล้วรวมด้วย id — ธรรมเนียมของ repo (ตัวจำลองในชุดตรวจไม่มี .or())
 */
export const getOutstandingClaims = cache(async (userId: string, all = false): Promise<OutstandingClaim[]> => {
  try {
    const supabase = createServiceClient()
    const base = () => {
      const q = supabase.from('expense_claims').select(COLUMNS).is('deleted_at', null)
      return all ? q : q.eq('submitted_by', userId)
    }
    const [tax, advance] = await Promise.all([
      base().eq('status', 'waiting_tax_invoice'),
      base().eq('claim_type', 'advance').eq('status', 'paid'),
    ])
    const error = tax.error ?? advance.error
    if (error) {
      console.error('getOutstandingClaims:', error.message)
      return []
    }
    // ponytail: ไม่แบ่งหน้า — ใบค้างทั้งระบบไม่น่าเกิน 1,000 แถว
    const byId = new Map<string, Row>()
    for (const c of [...(tax.data ?? []), ...(advance.data ?? [])] as unknown as Row[]) byId.set(c.id, c)
    return [...byId.values()]
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
      .flatMap(c => {
        const kind = outstandingKind(c)
        return kind
          ? [{ id: c.id, claim_number: c.claim_number, title: c.title, claim_type: c.claim_type, status: c.status, submitted_by: c.submitted_by, kind }]
          : []
      })
  } catch (e) {
    console.error('getOutstandingClaims:', e)
    return []
  }
})
