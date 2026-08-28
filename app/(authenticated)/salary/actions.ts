'use server'

// ============================================================================
// Server actions ของโมดูลเงินเดือน (อ่านสลิป/งวด)
// ค่าตั้งค่า + rate card + โปรไฟล์เงินเดือน อยู่ที่ ./settings/actions.ts
//
// types/database.types.ts ยังไม่มีตารางเงินเดือน (stale) → client ไม่ถูก generic
// ดังนั้น query กลับมาเป็น any แล้ว cast ตามรูปแบบเดียวกับโมดูลเอกสาร
// ============================================================================

import { createServiceClient } from '@/lib/supabase-server'
import { getSession, requireAdmin } from './session'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type SlipStatus = 'draft' | 'finalized' | 'paid'

/** สลิปของฉัน — พนักงานเห็นเฉพาะที่ปิดงวดแล้ว (finalized/paid) */
export interface MySlipRow {
  id: string
  status: 'finalized' | 'paid'
  total: number
  finalized_at: string | null
  paid_at: string | null
  period_key: string
  period_start: string
  period_end: string
}

/** งวดคำนวณ + จำนวนสลิปแต่ละสถานะ (หน้า /salary/runs) */
export interface RunListRow {
  id: string
  period_key: string
  period_start: string
  period_end: string
  note: string | null
  created_at: string | null
  draft: number
  finalized: number
  paid: number
  slips: number
}

// ────────────────────────────────────────────────────────────────────────────
// สลิปของฉัน
// ────────────────────────────────────────────────────────────────────────────

/**
 * สลิปที่ปิดงวดแล้วของผู้ใช้ที่ล็อกอิน เรียงงวดใหม่สุดก่อน
 * สลิปร่างไม่ถูกส่งกลับมาเลย (spec §สิทธิ์ — พนักงานไม่เห็นสลิปร่างของตัวเอง)
 */
export async function listMySlips(): Promise<MySlipRow[]> {
  const { userId } = await getSession()
  if (!userId) return []

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('salary_slips')
    .select('id, status, total, finalized_at, paid_at, run:salary_runs(period_key, period_start, period_end)')
    .eq('user_id', userId)
    .in('status', ['finalized', 'paid'])

  if (error || !data) return []

  type RunEmbed = { period_key: string; period_start: string; period_end: string }
  type Raw = {
    id: string
    status: 'finalized' | 'paid'
    total: number | string | null
    finalized_at: string | null
    paid_at: string | null
    // PostgREST คืน to-one เป็น object แต่บางเวอร์ชันห่อเป็น array — รับทั้งสองแบบ
    run: RunEmbed | RunEmbed[] | null
  }

  const rows = (data as unknown as Raw[]).map(r => {
    const run = Array.isArray(r.run) ? r.run[0] : r.run
    return {
      id: r.id,
      status: r.status,
      total: Number(r.total || 0),
      finalized_at: r.finalized_at,
      paid_at: r.paid_at,
      period_key: run?.period_key || '',
      period_start: run?.period_start || '',
      period_end: run?.period_end || '',
    }
  })

  // เรียงฝั่ง JS — order ตามคอลัมน์ของตารางที่ embed มาไม่เสถียรใน PostgREST
  return rows.sort((a, b) => (a.period_key < b.period_key ? 1 : a.period_key > b.period_key ? -1 : 0))
}

// ────────────────────────────────────────────────────────────────────────────
// งวดคำนวณ (admin)
// ────────────────────────────────────────────────────────────────────────────

/** งวดทั้งหมด + จำนวนสลิปแต่ละสถานะ — นับด้วย query เดียวแล้วรวมฝั่ง JS */
export async function listRuns(): Promise<RunListRow[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const supabase = createServiceClient()
  const [runsRes, slipsRes] = await Promise.all([
    supabase
      .from('salary_runs')
      .select('id, period_key, period_start, period_end, note, created_at')
      .order('period_key', { ascending: false }),
    supabase.from('salary_slips').select('run_id, status'),
  ])

  type RunRaw = {
    id: string
    period_key: string
    period_start: string
    period_end: string
    note: string | null
    created_at: string | null
  }
  type SlipRaw = { run_id: string; status: SlipStatus }

  const counts = new Map<string, { draft: number; finalized: number; paid: number }>()
  for (const s of ((slipsRes.data || []) as unknown as SlipRaw[])) {
    const c = counts.get(s.run_id) ?? { draft: 0, finalized: 0, paid: 0 }
    if (s.status === 'draft' || s.status === 'finalized' || s.status === 'paid') c[s.status] += 1
    counts.set(s.run_id, c)
  }

  return ((runsRes.data || []) as unknown as RunRaw[]).map(r => {
    const c = counts.get(r.id) ?? { draft: 0, finalized: 0, paid: 0 }
    return { ...r, ...c, slips: c.draft + c.finalized + c.paid }
  })
}
