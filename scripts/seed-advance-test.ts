/* eslint-disable no-console */
// Seed 5 test cases for 'advance' (เบิกทดลองจ่าย) claim type.
// Run:  npx tsx scripts/seed-advance-test.ts
//
// Behaviour:
//   1. Probes the DB to confirm the migration for `claim_type = 'advance'`
//      and the settlement columns has been applied.
//   2. Picks a submitter (first non-admin profile; falls back to any admin)
//      and an admin for approve/paid actions.
//   3. Generates claim numbers of the form EXP-YYYYMM-NNN, continuing the
//      existing sequence for the current month.
//   4. Inserts 5 claims covering every lifecycle stage + workflow log rows.
//
// Cleanup:
//   DELETE FROM expense_claims WHERE title LIKE '[TEST]%' AND claim_type = 'advance';

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function isoDaysFromNow(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function dateOnly(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

async function probeSchema() {
  // Any of the new advance columns will do — pick actual_spent_amount.
  const { error } = await supabase
    .from('expense_claims')
    .select('id, actual_spent_amount, refund_amount, actual_receipt_urls, refund_slip_urls, advance_settled_at, advance_settled_by')
    .limit(1)
  if (error) {
    throw new Error(
      `Schema not ready — the advance migration is likely unapplied.\n` +
      `Apply supabase/migrations/20260423_add_advance_claim_type.sql first.\n` +
      `Supabase error: ${error.message}`
    )
  }
}

async function pickProfiles() {
  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .neq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)

  const { data: admins } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)

  const admin = admins?.[0]
  if (!admin) throw new Error('No admin profile found — cannot seed test claims')
  const submitter = staff?.[0] ?? admin
  return { submitter, admin }
}

async function nextClaimNumberStart(): Promise<{ prefix: string; nextSeq: number }> {
  const now = new Date()
  const prefix = `EXP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const { count } = await supabase
    .from('expense_claims')
    .select('id', { count: 'exact', head: true })
    .like('claim_number', `${prefix}%`)
  return { prefix, nextSeq: (count ?? 0) + 1 }
}

type Base = {
  submitter: string
  admin: string
  claimNumber: string
}

async function seed() {
  await probeSchema()
  const { submitter, admin } = await pickProfiles()
  console.log(`• Submitter: ${submitter.full_name} (${submitter.id})`)
  console.log(`• Admin:     ${admin.full_name} (${admin.id})`)

  let { prefix, nextSeq } = await nextClaimNumberStart()
  const num = () => `${prefix}-${String(nextSeq++).padStart(3, '0')}`

  const base = (overrides: Record<string, any>) => ({
    claim_type: 'advance',
    category: 'other',
    unit: 'บาท',
    quantity: 1,
    vat_mode: 'none',
    include_vat: false,
    withholding_tax_rate: 0,
    submitted_by: submitter.id,
    bank_name: 'กสิกรไทย',
    bank_account_number: '123-4-56789-0',
    account_holder_name: submitter.full_name,
    ...overrides,
  })

  const created: { id: string; claim_number: string; note: string }[] = []

  // TC1 — Draft
  {
    const claim_number = num()
    const { data, error } = await supabase.from('expense_claims').insert(base({
      claim_number,
      title: '[TEST 1/5] เบิกทดลองจ่าย — ค่าเดินทางไปถ่ายงานต่างจังหวัด',
      description: 'คาดว่าจะใช้ค่าน้ำมัน + ทางด่วน + ที่พัก 1 คืน',
      category: 'travel',
      amount: 5000, unit_price: 5000,
      expense_date: dateOnly(2),
      status: 'draft',
      notes: 'TC1 — draft stage',
    })).select('id').single()
    if (error) throw error
    created.push({ id: data.id, claim_number, note: 'draft' })
  }

  // TC2 — Pending
  {
    const claim_number = num()
    const { data, error } = await supabase.from('expense_claims').insert(base({
      claim_number,
      title: '[TEST 2/5] เบิกทดลองจ่าย — ค่าอุปกรณ์ set งานอีเวนต์',
      description: 'ต้องซื้ออุปกรณ์ประกอบฉากที่ร้านล่วงหน้า',
      category: 'equipment',
      amount: 8000, unit_price: 8000,
      expense_date: dateOnly(3),
      status: 'pending',
      submitted_at: isoDaysFromNow(-0.08),
      notes: 'TC2 — pending admin review',
      bank_name: 'ไทยพาณิชย์',
      bank_account_number: '234-5-67890-1',
    })).select('id').single()
    if (error) throw error
    await supabase.from('expense_claim_logs').insert({
      claim_id: data.id,
      action: 'submit',
      changed_by: submitter.id,
      changes: { status: { from: 'draft', to: 'pending' } },
      note: 'ยื่นใบเบิกเพื่อขออนุมัติ',
    })
    created.push({ id: data.id, claim_number, note: 'pending' })
  }

  // TC3 — Approved, not yet settled
  {
    const claim_number = num()
    const { data, error } = await supabase.from('expense_claims').insert(base({
      claim_number,
      title: '[TEST 3/5] เบิกทดลองจ่าย — ค่าอาหารและเครื่องดื่มทีมงาน',
      description: 'เลี้ยงทีมงานระหว่างออกกอง 3 วัน',
      category: 'food',
      amount: 6000, unit_price: 6000,
      expense_date: dateOnly(-1),
      status: 'approved',
      submitted_at: isoDaysFromNow(-1),
      approved_by: admin.id,
      approved_at: isoDaysFromNow(-0.8),
      notes: 'TC3 — approved, waiting for user to report actual spend',
      bank_name: 'กรุงเทพ',
      bank_account_number: '345-6-78901-2',
    })).select('id').single()
    if (error) throw error
    await supabase.from('expense_claim_logs').insert([
      { claim_id: data.id, action: 'submit',  changed_by: submitter.id, changes: { status: { from: 'draft',   to: 'pending' } }, note: 'ยื่นใบเบิกเพื่อขออนุมัติ' },
      { claim_id: data.id, action: 'approve', changed_by: admin.id,     changes: { status: { from: 'pending', to: 'approved' } }, note: 'อนุมัติใบเบิก' },
    ])
    created.push({ id: data.id, claim_number, note: 'approved (awaiting settle)' })
  }

  // TC4 — Paid + Settled with refund
  {
    const claim_number = num()
    const { data, error } = await supabase.from('expense_claims').insert(base({
      claim_number,
      title: '[TEST 4/5] เบิกทดลองจ่าย — ค่า Prop งาน Wedding ลูกค้า A',
      description: 'เบิกล่วงหน้าสำหรับจัดซื้อ Prop ประดับงาน',
      category: 'equipment',
      amount: 10000, unit_price: 10000,
      expense_date: dateOnly(-5),
      status: 'paid',
      submitted_at: isoDaysFromNow(-8),
      approved_by: admin.id,
      approved_at: isoDaysFromNow(-7),
      paid_by: admin.id,
      paid_at: isoDaysFromNow(-7),
      actual_spent_amount: 7350,
      refund_amount: 2650,
      actual_receipt_urls: [
        'https://placehold.co/600x400/png?text=Actual+Receipt+1',
        'https://placehold.co/600x400/png?text=Actual+Receipt+2',
      ],
      refund_slip_urls: [
        'https://placehold.co/600x400/png?text=Refund+Slip+2650',
      ],
      advance_settled_by: submitter.id,
      advance_settled_at: isoDaysFromNow(-2),
      notes: 'TC4 — settled with refund ฿2,650',
    })).select('id').single()
    if (error) throw error
    await supabase.from('expense_claim_logs').insert([
      { claim_id: data.id, action: 'submit',         changed_by: submitter.id, changes: { status: { from: 'draft',    to: 'pending' } },  note: 'ยื่นใบเบิกเพื่อขออนุมัติ' },
      { claim_id: data.id, action: 'approve',        changed_by: admin.id,     changes: { status: { from: 'pending',  to: 'approved' } }, note: 'อนุมัติใบเบิก' },
      { claim_id: data.id, action: 'mark_paid',      changed_by: admin.id,     changes: { status: { from: 'approved', to: 'paid' } },     note: 'ชำระเงินแล้ว' },
      { claim_id: data.id, action: 'settle_advance', changed_by: submitter.id, changes: {
          actual_spent_amount: { from: null, to: 7350 },
          refund_amount:       { from: null, to: 2650 },
        }, note: 'อัพเดทค่าใช้จ่ายจริง ฿7,350 (เงินคืน ฿2,650)' },
    ])
    created.push({ id: data.id, claim_number, note: 'paid + settled, refund ฿2,650' })
  }

  // TC5 — Paid + Settled, no refund
  {
    const claim_number = num()
    const { data, error } = await supabase.from('expense_claims').insert(base({
      claim_number,
      title: '[TEST 5/5] เบิกทดลองจ่าย — ค่าสถานที่ประชุมนอกบริษัท',
      description: 'จองห้องประชุม + อาหารกลางวันทีม',
      category: 'venue',
      amount: 4500, unit_price: 4500,
      expense_date: dateOnly(-10),
      status: 'paid',
      submitted_at: isoDaysFromNow(-12),
      approved_by: admin.id,
      approved_at: isoDaysFromNow(-11),
      paid_by: admin.id,
      paid_at: isoDaysFromNow(-11),
      actual_spent_amount: 4500,
      refund_amount: 0,
      actual_receipt_urls: [
        'https://placehold.co/600x400/png?text=Venue+Receipt',
        'https://placehold.co/600x400/png?text=Lunch+Receipt',
      ],
      advance_settled_by: submitter.id,
      advance_settled_at: isoDaysFromNow(-6),
      notes: 'TC5 — settled, no refund (spent exactly the advance)',
      bank_name: 'ไทยพาณิชย์',
      bank_account_number: '234-5-67890-1',
    })).select('id').single()
    if (error) throw error
    await supabase.from('expense_claim_logs').insert([
      { claim_id: data.id, action: 'submit',         changed_by: submitter.id, changes: { status: { from: 'draft',    to: 'pending' } },  note: 'ยื่นใบเบิกเพื่อขออนุมัติ' },
      { claim_id: data.id, action: 'approve',        changed_by: admin.id,     changes: { status: { from: 'pending',  to: 'approved' } }, note: 'อนุมัติใบเบิก' },
      { claim_id: data.id, action: 'mark_paid',      changed_by: admin.id,     changes: { status: { from: 'approved', to: 'paid' } },     note: 'ชำระเงินแล้ว' },
      { claim_id: data.id, action: 'settle_advance', changed_by: submitter.id, changes: {
          actual_spent_amount: { from: null, to: 4500 },
          refund_amount:       { from: null, to: 0 },
        }, note: 'อัพเดทค่าใช้จ่ายจริง ฿4,500 (ไม่มีเงินคืน)' },
    ])
    created.push({ id: data.id, claim_number, note: 'paid + settled, no refund' })
  }

  console.log('\nCreated 5 advance test claims:')
  for (const c of created) console.log(`  ${c.claim_number}  →  ${c.note}  (${c.id})`)
}

seed().catch((err) => {
  console.error('\n✗ Seed failed:', err.message || err)
  process.exit(1)
})
