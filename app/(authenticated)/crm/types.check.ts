// ตรวจ helper ล้วนของ CRM (types.ts) — ข้อมูลสังเคราะห์ ไม่แตะฐานข้อมูล
// Run:  npx tsx "app/(authenticated)/crm/types.check.ts"
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "crm-types: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { addDays,
  boardStatuses, unknownStatuses, getStatusConfig, isWonStatus, isFirstWon, staleLeadIds, bangkokToday,
  BOARD_COLUMNS, DAY_MS, NOT_WON_STATUSES, type CrmSetting, type StaleRow,
} from './types'
import { isWonStatus as commissionIsWon } from '../sales-board/commission-logic'

const setting = (value: string, sort_order: number, is_active = true): CrmSetting => ({
  id: `s-${value}`, category: 'kanban_status', value, label_th: `ไทย-${value}`, label_en: `en-${value}`,
  color: '#111111', price: null, description: null, sort_order, is_active, created_at: '2026-01-01T00:00:00Z',
})
const settings = [setting('accepted', 2), setting('quotation_sent', 1), setting('ปิด', 3), setting('old', 4, false),
  { ...setting('pkg', 0), category: 'package' }]
const leads = ['lead', 'rejected', 'lead', 'accepted', 'old', 'lead', 'rejected', 'zzz', 'aaa', ''].map(status => ({ status }))

// (a) คอลัมน์บอร์ด = ตั้งค่า (เรียง sort_order, เฉพาะที่เปิด) แล้วตามด้วยสถานะในข้อมูลที่ไม่ได้ตั้งค่า (มาก → น้อย แล้วตามชื่อ)
assert.deepEqual(unknownStatuses(settings, leads), ['lead', 'rejected', 'aaa', 'old', 'zzz'])
assert.deepEqual(boardStatuses(settings, leads), ['quotation_sent', 'accepted', 'ปิด', 'lead', 'rejected', 'aaa', 'old', 'zzz'])
assert.deepEqual(unknownStatuses(settings, [{ status: 'accepted' }]), [])
console.log('PASS  (a) boardStatuses / unknownStatuses')

// (b) ไม่มีแถวตั้งค่า → ชื่อ = ค่าดิบ สีเทา · มีแถว → ชื่อจากตั้งค่า
assert.deepEqual(
  [getStatusConfig(settings, 'lead').label, getStatusConfig(settings, 'lead').labelTh, getStatusConfig(settings, 'lead').color],
  ['lead', 'lead', '#9ca3af'])
assert.equal(getStatusConfig(settings, 'accepted').labelTh, 'ไทย-accepted')
console.log('PASS  (b) getStatusConfig fallback = ค่าดิบ')

// (c) won = ทุกสถานะที่ไม่อยู่ใน NOT_WON (ตัดช่องว่าง ไม่สนตัวพิมพ์)
for (const s of ['Success', 'FP', 'ปิด', 'credit', ' Accepted ', 'DR']) assert.equal(isWonStatus(s), true, `${s} ต้อง won`)
for (const s of ['lead', 'quotation_sent', 'rejected', '', null, undefined, ' Lead ']) assert.equal(isWonStatus(s), false, `${String(s)} ต้องไม่ won`)
assert.equal(commissionIsWon, isWonStatus, 'commission-logic ต้อง re-export ตัวเดียวกัน')
assert.ok(NOT_WON_STATUSES.includes('rejected') && NOT_WON_STATUSES.every(s => /^[a-z_]+$/.test(s)), 'ค่าใน NOT_WON ใช้ใน filter in.(...) ได้')
console.log('PASS  (c) isWonStatus')

// (d) สร้างใบงานอัตโนมัติเฉพาะตอนเข้า won ครั้งแรก
assert.equal(isFirstWon('quotation_sent', 'FP'), true, 'ข้ามตอบรับไปรับมัดจำ ก็นับ')
assert.equal(isFirstWon('quotation_sent', 'accepted'), true)
assert.equal(isFirstWon(null, 'accepted'), true, 'อ่านสถานะเดิมไม่ได้ → ถือว่ายังไม่ won')
assert.equal(isFirstWon('accepted', 'FP'), false, 'won → won ไม่สร้างซ้ำ')
assert.equal(isFirstWon('FP', 'rejected'), false)
assert.equal(isFirstWon('lead', 'quotation_sent'), false)
console.log('PASS  (d) isFirstWon')

// (e) เก็บงานเก่าเข้าคลัง — ขอบ 90/180 วัน
const NOW = Date.UTC(2026, 9, 7, 5, 0, 0) // 2026-10-07 12:00 เวลาไทย
assert.equal(bangkokToday(NOW), '2026-10-07')
assert.equal(bangkokToday(Date.UTC(2026, 9, 6, 17, 30)), '2026-10-07', 'เลยเที่ยงคืนไทยแล้ว = วันใหม่')
const ago = (d: number) => new Date(NOW - d * DAY_MS).toISOString()
const row = (id: string, status: string, days: number, event_date: string | null = null, viaCreated = false): StaleRow => ({
  id, status, event_date, created_at: ago(days), updated_at: viaCreated ? null : ago(days),
})
const rows: StaleRow[] = [
  row('rej-89', 'rejected', 89), row('rej-91', 'rejected', 91), row('close-91', 'ปิด', 91),
  row('close-91-created', 'ปิด', 91, null, true), // updated_at ว่าง → ใช้ created_at
  row('acc-500', 'accepted', 500), row('ฟ', 'FP', 500),
  row('lead-179', 'lead', 179), row('lead-181', 'lead', 181), row('lead-181-past', 'lead', 181, '2026-01-01'),
  row('lead-181-future', 'lead', 181, '2026-12-31'), row('lead-181-today', 'lead', 181, '2026-10-07'),
  row('lead-181-created', 'lead', 181, null, true),
]
const stale = staleLeadIds(rows, NOW)
assert.deepEqual(stale.closed, ['rej-91', 'close-91', 'close-91-created'])
assert.deepEqual(stale.cold, ['lead-181', 'lead-181-past', 'lead-181-created'], 'ลูกค้าใหม่ที่วันงานยังไม่ถึง (รวมวันนี้) ไม่นับเป็นงานเย็น')
assert.deepEqual(staleLeadIds([], NOW), { closed: [], cold: [] })
console.log('PASS  (e) staleLeadIds ขอบ 89/91 และ 179/181 วัน วันงานในอนาคตไม่เย็น')

// (f) คอลัมน์แบบเบาไม่มีคอลัมน์หนัก
for (const heavy of ['notes', 'required_roles', 'installment_1', '*']) assert.ok(!BOARD_COLUMNS.split(/[ ,()]+/).includes(heavy), `BOARD_COLUMNS ต้องไม่มี ${heavy}`)
console.log('PASS  (f) BOARD_COLUMNS ไม่ดึง notes / required_roles / installment_N')

// addDays — ข้ามเดือน/ปี และติดลบ
assert.equal(addDays('2026-10-30', 3), '2026-11-02')
assert.equal(addDays('2026-12-31', 1), '2027-01-01')
assert.equal(addDays('2026-03-01', -1), '2026-02-28')

console.log('\ncrm-types: ผ่านทั้งหมด')
