// ============================================================================
// Sync บรรทัดค่าสตาฟของสลิป → job_cost_items (โมดูลต้นทุน) — ส่วน "pure" ล้วน
//
// ponytail: ไฟล์นี้ห้ามมี 'use server' และห้าม import อะไรที่แตะ cookies/DB —
// scripts/salary-check.ts (A15) import ตรงๆ ได้จึงต้องไม่ลาก next/headers เข้ามา
// ตัว server action (syncSlipToCosts) อยู่ใน ./actions.ts และเรียก helper ที่นี่
//
// ADR-0001: ใบเบิกค่าสตาฟอัตโนมัติถูกลบไปแล้ว → นี่คือทางเดียวที่ต้นทุนสตาฟ
// ต่ออีเวนต์กลับเข้าโมดูลต้นทุน
// ============================================================================

import { bangkokDate, lineAmount } from './compute'
import type { SalaryLine } from './compute'

/** เช็คอินเท่าที่การ sync ต้นทุนต้องรู้ — ผูกบรรทัดกับอีเวนต์ */
export interface CostsSyncCheckin {
  id: string
  event_id: string | null
  checked_in_at: string
}

/** สลิปเท่าที่การ sync ต้นทุนต้องรู้ */
export interface CostsSyncSlip {
  id: string
  user_id: string
  lines: SalaryLine[]
}

/** หนึ่งแถวที่จะไปเป็น job_cost_items (category 'staff') */
export interface CostsRow {
  event_id: string
  amount: number
  /** YYYY-MM-DD — วันของบรรทัดสลิป (= วันเช็คอินตามเวลาไทย) */
  cost_date: string
  description: string
  /** คีย์ idempotent — sync ซ้ำแล้วอัปเดตแถวเดิม ไม่เพิ่มแถวใหม่ */
  notes: string
}

/** บรรทัดที่ผูกอีเวนต์ไม่ได้ — คืนให้ผู้เรียกไป log (สลิปที่ปิดงวดแล้วเขียน warning ไม่ได้) */
export interface CostsSkip {
  key: string
  reason: 'costs_runner_skipped'
}

export interface CostsRowsResult {
  rows: CostsRow[]
  skipped: CostsSkip[]
}

/** คีย์ notes ของแถวต้นทุนที่มาจากบรรทัดสลิป — ใช้จับคู่ตอน sync ซ้ำ */
export function costsNotesKey(slipId: string, lineKey: string): string {
  return `salary_slip::${slipId}::${lineKey}`
}

/**
 * บรรทัดสลิป → แถวต้นทุนต่ออีเวนต์ (pure — เทสต์ได้โดยไม่ต้องมี DB)
 *
 * กติกา (spec §ต้นทุน):
 * - `site` / `oop` — ผูกอีเวนต์ผ่าน `checkin_id` ของบรรทัด; เช็คอินไม่มี `event_id` → ข้ามเงียบ
 *   (มี warning `no_event` ในสลิปอยู่แล้วตั้งแต่ตอนคำนวณ)
 * - `runner` — ไม่มี `checkin_id` (เป็นยอดต่อวัน) จึงเดาอีเวนต์จากเช็คอินหน้างานของวันนั้น
 *   ผูกได้เฉพาะเมื่อวันนั้นมีอีเวนต์ "เดียว"; 0 หรือ >1 อีเวนต์ → ข้ามพร้อมเหตุผล
 * - `ot` — ไม่ sync (OT ไม่ผูกอีเวนต์เดียว) · รายการปรับมือไม่ sync (ไม่ได้อยู่ใน lines อยู่แล้ว)
 * - `amount === null` (รันเนอร์ที่ยังไม่กรอก) และยอด 0 → ข้าม ไม่มีประโยชน์ในต้นทุน
 */
export function costsRowsForSlip(
  slip: CostsSyncSlip,
  checkins: CostsSyncCheckin[],
  fullName: string,
  dutyNames: Record<string, string>
): CostsRowsResult {
  const checkinById = new Map(checkins.map(c => [c.id, c]))

  /** วันไทย → เซ็ตอีเวนต์ของเช็คอินหน้างานวันนั้น (ใช้ผูกบรรทัดรันเนอร์) */
  const eventsByDate = new Map<string, Set<string>>()
  for (const c of checkins) {
    if (!c.event_id) continue
    const date = bangkokDate(c.checked_in_at)
    const set = eventsByDate.get(date)
    if (set) set.add(c.event_id)
    else eventsByDate.set(date, new Set([c.event_id]))
  }

  const rows: CostsRow[] = []
  const skipped: CostsSkip[] = []

  for (const line of slip.lines) {
    if (line.kind === 'ot') continue
    if (line.amount === null || line.amount === undefined) continue

    const amount = lineAmount(line)
    if (amount === 0) continue

    let eventId: string | null = null
    let description = ''

    if (line.kind === 'site') {
      eventId = (line.checkin_id ? checkinById.get(line.checkin_id)?.event_id : null) ?? null
      const dutyName = (line.duty ? dutyNames[line.duty] : '') || line.duty || 'หน้าที่หน้างาน'
      description = `ค่าสตาฟ ${fullName} — ${dutyName}`
    } else if (line.kind === 'oop') {
      eventId = (line.checkin_id ? checkinById.get(line.checkin_id)?.event_id : null) ?? null
      description = `เบิ้ลต่างจังหวัด ${fullName}`
    } else {
      // runner — ผูกได้เฉพาะวันที่มีอีเวนต์เดียว
      const dayEvents = eventsByDate.get(line.date)
      if (!dayEvents || dayEvents.size !== 1) {
        skipped.push({ key: line.key, reason: 'costs_runner_skipped' })
        continue
      }
      eventId = Array.from(dayEvents)[0]
      description = `รันเนอร์ ${fullName}`
    }

    if (!eventId) continue

    rows.push({
      event_id: eventId,
      amount,
      cost_date: line.date,
      description,
      notes: costsNotesKey(slip.id, line.key),
    })
  }

  return { rows, skipped }
}
