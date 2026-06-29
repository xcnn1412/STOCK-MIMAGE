// Backfill: ซิงค์ job_cost_items ที่ auto-สร้างจากใบเบิก ให้ตรงกับ expense_claims ปัจจุบัน
// แก้ปัญหา cost item ค้างเป็น snapshot เก่า (เช่น ยอด 0 ขณะที่ใบเบิกจริง 1,000)
//
// รัน:  node scripts/sync-cost-items-from-claims.mjs          (dry-run — แค่โชว์ส่วนต่าง)
//       node scripts/sync-cost-items-from-claims.mjs apply    (เขียนจริง)
//
// จับเฉพาะ job_cost_items.notes รูปแบบ "<claim_number>::<claimId>" (รายการ auto จากใบเบิก)
// รายการที่กรอกมือ (ไม่มี "::") ไม่ถูกแตะ.

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const APPLY = process.argv.includes('apply')
const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const num = v => Number(v || 0)

async function all(table, cols, filter) {
  let rows = [], from = 0, step = 1000
  for (;;) {
    let q = sb.from(table).select(cols).range(from, from + step - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) { console.error(table, error.message); break }
    rows = rows.concat(data); if (data.length < step) break; from += step
  }
  return rows
}

const items = await all('job_cost_items', 'id, job_event_id, category, description, amount, unit_price, quantity, notes', q => q.like('notes', '%::%'))
const claims = await all('expense_claims', 'id, claim_number, title, category, amount, unit_price, quantity, job_event_id')
const claimById = new Map(claims.map(c => [c.id, c]))

const expectedAmount = c => num(c.amount) || (num(c.unit_price) * num(c.quantity))

let mismatch = 0, missingClaim = 0, fixed = 0, orphansDeleted = 0
for (const it of items) {
  const claimId = String(it.notes).split('::')[1]
  if (!claimId) continue
  const c = claimById.get(claimId)
  if (!c) {
    // ใบเบิกถูกลบไปแล้ว → cost item เป็น orphan ค้างเติมต้นทุนเกินจริง → ลบทิ้ง
    missingClaim++
    console.log(`ORPHAN ${String(it.notes).split('::')[0]}: amount ${num(it.amount)} (ใบเบิกถูกลบ) → ลบ`)
    if (APPLY) {
      const { error } = await sb.from('job_cost_items').delete().eq('id', it.id)
      if (error) console.error('  delete failed:', error.message); else orphansDeleted++
    }
    continue
  }

  const amount = expectedAmount(c)
  const desc = `[เบิกเงิน] ${c.title}`
  const drift =
    num(it.amount) !== amount ||
    it.category !== c.category ||
    it.description !== desc ||
    (c.job_event_id && it.job_event_id !== c.job_event_id)

  if (!drift) continue
  mismatch++
  console.log(`${c.claim_number}: amount ${num(it.amount)} → ${amount}${it.category !== c.category ? ` | cat ${it.category}→${c.category}` : ''}${c.job_event_id && it.job_event_id !== c.job_event_id ? ' | event moved' : ''}`)

  if (APPLY) {
    const { error } = await sb.from('job_cost_items').update({
      job_event_id: c.job_event_id || it.job_event_id,
      category: c.category,
      description: desc,
      amount,
      unit_price: num(c.unit_price) || amount,
      quantity: c.quantity,
    }).eq('id', it.id)
    if (error) console.error('  update failed:', error.message); else fixed++
  }
}

console.log(`\nลิงก์ใบเบิก: ${items.length} รายการ | ไม่ตรง: ${mismatch} | orphan: ${missingClaim}`)
console.log(APPLY ? `แก้ยอดแล้ว: ${fixed} | ลบ orphan: ${orphansDeleted}` : 'DRY-RUN — เพิ่ม argument "apply" เพื่อเขียนจริง')
