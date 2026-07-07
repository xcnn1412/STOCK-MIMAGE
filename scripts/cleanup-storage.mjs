// ล้างพื้นที่ Supabase Storage — เฟส 1 (orphan + login_selfies) + เฟส 2 (checkin retention 30 วัน)
//
// รัน:  node scripts/cleanup-storage.mjs           (dry-run — โชว์ว่าจะลบอะไร ขนาดเท่าไหร่)
//       node scripts/cleanup-storage.mjs --apply   (ลบจริง + NULL คอลัมน์รูปเช็คอินที่ถูกลบ)
//
// กติกาต่อ bucket:
//   login_selfies                                   → ลบทั้งหมด (ฟีเจอร์ตายแล้ว)
//   receipts, item-images, ticket-attachments,
//   crm-payment-proofs                              → ลบเฉพาะ orphan (ไม่มี record อ้างถึง)
//   checkin-photos                                  → ลบ orphan + รูปเก่ากว่า 30 วัน แล้ว NULL คอลัมน์ที่ชี้ไฟล์นั้น
//
// อ่านอ้างอิงจาก storage.objects โดยตรงผ่าน sb.schema('storage') (service role bypass RLS)

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const APPLY = process.argv.includes('--apply')
const CHECKIN_RETENTION_DAYS = 30

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const mb = b => (b / 1024 / 1024).toFixed(1) + ' MB'
const keyOf = (url, bucket) => { const p = String(url).split(`/${bucket}/`); return p.length > 1 ? p[1] : null }

// ดึงทุกแถวแบบ paginate
async function all(schema, table, cols, filter) {
  let rows = [], from = 0, step = 1000
  for (;;) {
    let q = sb.schema(schema).from(table).select(cols).range(from, from + step - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) { console.error(`${schema}.${table}:`, error.message); process.exit(1) }
    rows = rows.concat(data); if (data.length < step) break; from += step
  }
  return rows
}
const objects = bucket => all('storage', 'objects', 'name, created_at, metadata', q => q.eq('bucket_id', bucket))
const sizeOf = o => Number(o.metadata?.size || 0)

// รวบรวม referenced keys ต่อ bucket (จาก public tables)
async function referencedKeys(bucket) {
  const keys = new Set()
  const push = url => { const k = keyOf(url, bucket); if (k) keys.add(k) }
  if (bucket === 'receipts') {
    for (const r of await all('public', 'expense_claims', 'receipt_urls, tax_invoice_urls, actual_receipt_urls'))
      for (const arr of [r.receipt_urls, r.tax_invoice_urls, r.actual_receipt_urls]) (arr || []).forEach(push)
  } else if (bucket === 'item-images') {
    for (const r of await all('public', 'items', 'image_url')) {
      if (!r.image_url) continue
      let urls = []
      try { urls = r.image_url.startsWith('[') ? JSON.parse(r.image_url) : [r.image_url] } catch { urls = [r.image_url] }
      urls.forEach(push)
    }
  } else if (bucket === 'ticket-attachments') {
    for (const [t, c] of [['tickets', 'attachments'], ['ticket_replies', 'attachments'], ['my_job_comments', 'attachments'], ['my_ticket_comments', 'attachments']])
      for (const r of await all('public', t, c)) (r[c] || []).forEach(push)
  } else if (bucket === 'crm-payment-proofs') {
    for (const r of await all('public', 'crm_lead_installments', 'receipt_url')) push(r.receipt_url)
  }
  return keys
}

// referenced rows ของ checkin-photos (เก็บ table/column/id ไว้เพื่อ NULL ทีหลัง)
async function checkinRefs() {
  const refs = [] // {key, table, column, id}
  const add = (url, table, column, id) => { const k = keyOf(url, 'checkin-photos'); if (k) refs.push({ key: k, table, column, id }) }
  for (const r of await all('public', 'staff_checkins', 'id, photo_url, checkout_photo_url')) {
    add(r.photo_url, 'staff_checkins', 'photo_url', r.id)
    add(r.checkout_photo_url, 'staff_checkins', 'checkout_photo_url', r.id)
  }
  for (const r of await all('public', 'leave_requests', 'id, attachment_url'))
    add(r.attachment_url, 'leave_requests', 'attachment_url', r.id)
  return refs
}

async function removeBatched(bucket, keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000)
    const { error } = await sb.storage.from(bucket).remove(batch)
    if (error) { console.error(`remove ${bucket}:`, error.message); process.exit(1) }
    console.log(`  ลบ ${bucket}: ${Math.min(i + 1000, keys.length)}/${keys.length}`)
  }
}

// ---- คำนวณสิ่งที่จะลบ ----
const plan = [] // {bucket, keys:[], bytes}
let checkinNulls = [] // {table, column, id}

for (const bucket of ['login_selfies', 'receipts', 'item-images', 'ticket-attachments', 'crm-payment-proofs']) {
  const objs = await objects(bucket)
  let del
  if (bucket === 'login_selfies') {
    del = objs
  } else {
    const ref = await referencedKeys(bucket)
    del = objs.filter(o => !ref.has(o.name))
  }
  plan.push({ bucket, keys: del.map(o => o.name), bytes: del.reduce((s, o) => s + sizeOf(o), 0), total: objs.length })
}

// checkin-photos: orphan OR เก่ากว่า retention
{
  const cutoff = new Date(Date.now() - CHECKIN_RETENTION_DAYS * 86400_000)
  const objs = await objects('checkin-photos')
  const refs = await checkinRefs()
  const refSet = new Set(refs.map(r => r.key))
  const del = objs.filter(o => new Date(o.created_at) < cutoff || !refSet.has(o.name))
  const delSet = new Set(del.map(o => o.name))
  checkinNulls = refs.filter(r => delSet.has(r.key))
  plan.push({ bucket: 'checkin-photos', keys: del.map(o => o.name), bytes: del.reduce((s, o) => s + sizeOf(o), 0), total: objs.length })
}

// ---- รายงาน ----
console.log(`\n=== Cleanup Storage (${APPLY ? 'APPLY — ลบจริง' : 'DRY-RUN'}) ===`)
let totalBytes = 0, totalFiles = 0
for (const p of plan) {
  totalBytes += p.bytes; totalFiles += p.keys.length
  console.log(`  ${p.bucket.padEnd(20)} ลบ ${String(p.keys.length).padStart(5)}/${p.total} ไฟล์  ${mb(p.bytes)}`)
}
console.log(`  ${''.padEnd(20)} รวม ${String(totalFiles).padStart(5)} ไฟล์  ${mb(totalBytes)}`)
console.log(`  checkin คอลัมน์ที่จะ NULL: ${checkinNulls.length} จุด`)

if (!APPLY) {
  console.log('\nนี่คือ dry-run — ยังไม่ลบอะไร. รันซ้ำด้วย --apply เพื่อลบจริง')
  process.exit(0)
}

// ---- ลบจริง ----
console.log('\nเริ่มลบ...')
for (const p of plan) if (p.keys.length) await removeBatched(p.bucket, p.keys)

// NULL คอลัมน์รูปเช็คอินที่ถูกลบ (กัน broken image) — group by table+column
const groups = {}
for (const n of checkinNulls) (groups[`${n.table}|${n.column}`] ||= []).push(n.id)
for (const [tc, ids] of Object.entries(groups)) {
  const [table, column] = tc.split('|')
  const uniq = [...new Set(ids)]
  for (let i = 0; i < uniq.length; i += 1000) {
    const batch = uniq.slice(i, i + 1000)
    const { error } = await sb.from(table).update({ [column]: null }).in('id', batch)
    if (error) { console.error(`NULL ${tc}:`, error.message); process.exit(1) }
  }
  console.log(`  NULL ${tc}: ${uniq.length} แถว`)
}

console.log('\nเสร็จ. เช็คพื้นที่ซ้ำได้จาก Supabase dashboard หรือ query storage.objects')
