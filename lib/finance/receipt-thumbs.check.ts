// ตรวจชื่อไฟล์/URL ของรูปย่อไฟล์แนบใบเบิก (lib/finance/receipt-thumbs.ts) — ไม่แตะสตอเรจหรือเครือข่าย
// Run:  npx tsx lib/finance/receipt-thumbs.check.ts
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "receipt-thumbs: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { THUMB_MAX_DIMENSION, THUMB_MAX_MB, THUMB_SUFFIX, thumbPathFor, thumbUrlFor } from './receipt-thumbs'

const pass = (label: string) => console.log(`PASS  ${label}`)

// ตัวเลขตามข้อตกลง (หน้าจอส่งเป็นอาร์กิวเมนต์ของ compressImage)
assert.equal(THUMB_SUFFIX, '_thumb.jpg')
assert.equal(THUMB_MAX_DIMENSION, 320)
assert.equal(THUMB_MAX_MB, 0.3)
pass('THUMB_SUFFIX = _thumb.jpg · THUMB_MAX_DIMENSION = 320 · THUMB_MAX_MB = 0.3')

// ── path ในบัคเก็ต ────────────────────────────────────────────────────────────
assert.equal(thumbPathFor('claims/EXP-1/1_0.jpg'), 'claims/EXP-1/1_0_thumb.jpg')
assert.equal(thumbPathFor('claims/EXP-202609-001/1758300000000_2.PNG'), 'claims/EXP-202609-001/1758300000000_2_thumb.jpg')
assert.equal(thumbPathFor('claims/EXP-1-actual/1_0.jpeg'), 'claims/EXP-1-actual/1_0_thumb.jpg')
assert.equal(thumbPathFor('claims/a.b/1_0'), 'claims/a.b/1_0_thumb.jpg', 'จุดในชื่อโฟลเดอร์ไม่ใช่นามสกุล')
assert.equal(thumbPathFor('1_0.webp'), '1_0_thumb.jpg', 'ไม่มีโฟลเดอร์')
assert.equal(thumbPathFor('claims/EXP-1/1_0_thumb.jpg'), 'claims/EXP-1/1_0_thumb.jpg', 'เป็นรูปย่ออยู่แล้ว = คืนเดิม')
// รูปแบบ path ที่ uploadReceiptFiles สร้าง: claims/<เลขที่ที่ตัดอักขระ>/<Date.now()>_<i>.<นามสกุลของชื่อไฟล์>
for (const [claimNumber, fileName] of [['EXP-202609-015', 'ใบเสร็จ.jpg'], ['EXP-202609-015-tax-invoice', 'scan 01.png'], ['EXP-202609-015-refund', 'slip']]) {
  const safe = claimNumber.replace(/[^a-zA-Z0-9-]/g, '_')
  const ext = fileName.split('.').pop() || 'jpg'
  const original = `claims/${safe}/1758300000000_0.${ext}`
  const thumb = thumbPathFor(original)
  assert.equal(thumb, `claims/${safe}/1758300000000_0${THUMB_SUFFIX}`, `${fileName}: รูปย่ออยู่โฟลเดอร์เดียวกัน ชื่อเดียวกัน`)
  assert.notEqual(thumb, original)
}
pass('thumbPathFor: แทนนามสกุลของชื่อไฟล์ด้วย _thumb.jpg (ตัวใหญ่/ไม่มีนามสกุล/จุดในโฟลเดอร์) · path ที่เป็นรูปย่ออยู่แล้วคืนเดิม · ใช้กับ path ที่ uploadReceiptFiles สร้างได้')

// ── URL (ยังไม่ตั้ง NEXT_PUBLIC_SUPABASE_URL = ดูเฉพาะ path) ────────────────────────
delete process.env.NEXT_PUBLIC_SUPABASE_URL
const RECEIPTS = 'https://x.supabase.co/storage/v1/object/public/receipts'
assert.equal(thumbUrlFor(`${RECEIPTS}/claims/EXP-1/1_0.jpg`), `${RECEIPTS}/claims/EXP-1/1_0_thumb.jpg`)
assert.equal(thumbUrlFor(`${RECEIPTS}/claims/EXP-1/1_0.JPEG`), `${RECEIPTS}/claims/EXP-1/1_0_thumb.jpg`)
assert.equal(thumbUrlFor(`${RECEIPTS}/claims/EXP-1/1_0.png?t=1#x`), `${RECEIPTS}/claims/EXP-1/1_0_thumb.jpg?t=1#x`, '?query / #hash ต่อท้ายเหมือนเดิม')
assert.equal(thumbUrlFor(`${RECEIPTS}/claims/EXP-1/%E0%B8%81.jpg`), `${RECEIPTS}/claims/EXP-1/%E0%B8%81_thumb.jpg`, 'ชื่อที่เข้ารหัสคงรูปเดิม')
const nulls: [string, string][] = [
  ['PDF', `${RECEIPTS}/claims/EXP-1/1_0.pdf`],
  ['PDF ตัวใหญ่ + query', `${RECEIPTS}/claims/EXP-1/1_0.PDF?download=1`],
  ['เป็นรูปย่ออยู่แล้ว', `${RECEIPTS}/claims/EXP-1/1_0_thumb.jpg`],
  ['เว็บอื่น (ไม่ใช่สตอเรจ)', 'https://example.com/photos/1_0.jpg'],
  ['เว็บอื่น path คล้าย', 'https://example.com/receipts/claims/EXP-1/1_0.jpg'],
  ['บัคเก็ตอื่น', 'https://x.supabase.co/storage/v1/object/public/avatars/1_0.jpg'],
  ['ชื่อบัคเก็ตตัวใหญ่ (คนละบัคเก็ต)', 'https://x.supabase.co/storage/v1/object/public/Receipts/1_0.jpg'],
  ['signed URL', 'https://x.supabase.co/storage/v1/object/sign/receipts/1_0.jpg?token=abc'],
  ['ย้อนโฟลเดอร์ออกจาก receipts', `${RECEIPTS}/../avatars/1_0.jpg`],
  ['โฟลเดอร์ ไม่ใช่ไฟล์', `${RECEIPTS}/claims/EXP-1/`],
  ['ราก receipts', `${RECEIPTS}/`],
  ['userinfo หลอก', 'https://x.supabase.co@evil.com/storage/v1/object/public/receipts/1_0.jpg'],
  ['ไม่ใช่ http(s)', 'data:image/jpeg;base64,AAAA'],
  ['javascript:', 'javascript:alert(1)'],
  ['path ล้วน', '/storage/v1/object/public/receipts/1_0.jpg'],
  ['ว่าง', ''],
]
for (const [label, url] of nulls) assert.equal(thumbUrlFor(url), null, `${label}: ${url}`)
assert.equal(thumbUrlFor(null as unknown as string), null, 'null')
assert.equal(thumbUrlFor(undefined as unknown as string), null, 'undefined')
// URL ของรูปย่อ = URL สาธารณะของ thumbPathFor(path เดิม) — ฝั่ง server (อัปโหลด) กับฝั่งหน้าจอ (แสดง) ชี้ไฟล์เดียวกัน
for (const p of ['claims/EXP-202609-001/1758300000000_0.jpg', 'claims/EXP-202609-001-actual/1758300000000_3.png', 'x/y/z.heic']) {
  assert.equal(thumbUrlFor(`${RECEIPTS}/${p}`), `${RECEIPTS}/${thumbPathFor(p)}`, p)
}
pass(`thumbUrlFor (ยังไม่ตั้ง NEXT_PUBLIC_SUPABASE_URL): …/claims/EXP-1/1_0.jpg → …/claims/EXP-1/1_0_thumb.jpg · null ${nulls.length + 2} แบบ (.pdf, รูปย่ออยู่แล้ว, เว็บอื่น, บัคเก็ตอื่น, signed, ย้อนโฟลเดอร์, userinfo, ไม่ใช่ http(s), ว่าง) · ตรงกับ thumbPathFor ของ server`)

// ── URL เมื่อตั้ง NEXT_PUBLIC_SUPABASE_URL: ต้องเป็นสตอเรจของระบบเอง (host + protocol เดียวกัน) ─────────
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
assert.equal(thumbUrlFor(`${RECEIPTS}/claims/EXP-1/1_0.jpg`), `${RECEIPTS}/claims/EXP-1/1_0_thumb.jpg`)
for (const [label, url] of [
  ['host อื่น path เดียวกัน', 'https://other.supabase.co/storage/v1/object/public/receipts/claims/EXP-1/1_0.jpg'],
  ['host หน้าตาคล้าย', 'https://x.supabase.co.evil.com/storage/v1/object/public/receipts/claims/EXP-1/1_0.jpg'],
  ['http แทน https', 'http://x.supabase.co/storage/v1/object/public/receipts/claims/EXP-1/1_0.jpg'],
] as const) {
  assert.equal(thumbUrlFor(url), null, `${label}: ${url}`)
}
process.env.NEXT_PUBLIC_SUPABASE_URL = 'not a url'
assert.equal(thumbUrlFor(`${RECEIPTS}/claims/EXP-1/1_0.jpg`), `${RECEIPTS}/claims/EXP-1/1_0_thumb.jpg`, 'ค่าที่ตั้งไว้อ่านไม่ออก = ดูเฉพาะ path')
delete process.env.NEXT_PUBLIC_SUPABASE_URL
pass('thumbUrlFor (ตั้ง NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co): host อื่น / host หน้าตาคล้าย / http → null · host เดียวกัน → รูปย่อ')

console.log('\nreceipt-thumbs: ผ่านทั้งหมด')
