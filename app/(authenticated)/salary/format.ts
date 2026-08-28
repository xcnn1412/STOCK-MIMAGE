// ============================================================================
// ตัวจัดรูปแบบที่ทุกหน้าในโมดูลเงินเดือนใช้ร่วมกัน — pure ล้วน ใช้ได้ทั้ง server/client
// ============================================================================

import { THAI_MONTHS } from '@/lib/thai-date'

/** จำนวนเงิน — รูปแบบเดียวกับโมดูลการเงิน/ต้นทุน (ทศนิยม 2 ตำแหน่ง) */
export function fmtMoney(n: number | string | null | undefined): string {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 'YYYY-MM' → 'สิงหาคม 2569' — ชื่องวดที่ผู้ใช้เห็น (พ.ศ. เสมอ) */
export function periodLabel(periodKey: string | null | undefined): string {
  if (!periodKey) return '-'
  const [y, m] = periodKey.split('-').map(Number)
  const month = THAI_MONTHS[m - 1]
  if (!month || !y) return periodKey
  return `${month} ${y + 543}`
}
