// ตรวจกล่องรายการค้างเคลียร์ (outstanding-alert.tsx) — render เป็น HTML ไม่แตะฐานข้อมูล
// Run:  npx tsx "app/(authenticated)/finance/outstanding-alert.check.tsx"
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "outstanding-alert: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { OutstandingAlert, OutstandingPill } from './outstanding-alert'

const claims = [
  { id: 'a1', claim_number: 'EXP-1', title: 'ค่ารถ', kind: 'advance_unsettled' as const },
  { id: 'b2', claim_number: 'EXP-2', title: 'ค่าของ', kind: 'tax_invoice' as const },
]
const html = renderToStaticMarkup(<OutstandingAlert claims={claims} isEn={false} mode="block" />)
assert.ok(html.includes('ค้างเคลียร์ 2 ใบ'), 'หัวข้อบอกจำนวน')
assert.ok(html.includes('href="/finance/a1"') && html.includes('href="/finance/b2"'), 'ลิงก์ไปทุกใบ')
assert.ok(renderToStaticMarkup(<OutstandingPill count={3} isEn={false} />).includes('ค้าง 3 ใบ'), 'ป้ายจำนวน')
assert.equal(renderToStaticMarkup(<OutstandingAlert claims={[]} isEn={false} mode="block" />), '', 'ไม่มีค้าง → ไม่แสดง')

console.log('outstanding-alert: ผ่านทั้งหมด')
