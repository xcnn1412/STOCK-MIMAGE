// สร้างรูปย่อ (_thumb.jpg) ให้ไฟล์รูปเดิมใน bucket `receipts` — ขั้น 3 (v1.27.0) ของ docs/specs/finance-refactor-plan.md
// เจ้าของรันเองครั้งเดียวหลัง deploy v1.27.0 (ใบเบิกใหม่ได้รูปย่อตอนอัปโหลดอยู่แล้ว สคริปต์นี้ทำให้ไฟล์เก่า)
//
// รัน:  node scripts/backfill-receipt-thumbs.mjs                     (dry-run — แค่นับและโชว์ว่าจะสร้างอะไร ไม่เขียน)
//       node scripts/backfill-receipt-thumbs.mjs apply --limit 10    (สร้างจริง 10 ไฟล์แรก — ไว้เปิดหน้าใบเบิกดูก่อน)
//       node scripts/backfill-receipt-thumbs.mjs apply               (สร้างจริงทั้งหมด)
//
// ทำอะไร: ไฟล์รูป (.jpg/.jpeg/.png/.webp) ทุกไฟล์ใน receipts ที่ยังไม่มีรูปย่อ → ย่อด้านยาวสุด 320px เป็น JPEG
// (พื้นขาว หมุนตาม EXIF — แบบเดียวกับ compressImage ในหน้าจอ) → อัปโหลดเป็น <ชื่อเดิมไม่รวมนามสกุล>_thumb.jpg ข้างไฟล์เดิม
// พร้อม cacheControl 31536000 (เก็บในเครื่องผู้ใช้ได้ 1 ปี) · ราว 15KB ต่อรูป
//
// ความปลอดภัย: ไม่ลบไฟล์ใดๆ ไม่เขียนทับไฟล์เดิม (อัปโหลดเฉพาะ path ของรูปย่อ ด้วย upsert: false — มีอยู่แล้ว = ข้าม)
// ไม่แก้ฐานข้อมูล (หน้าจอหา URL รูปย่อจาก URL เดิมเอง: thumbUrlFor ใน lib/finance/receipt-thumbs.ts) · PDF ไม่มีรูปย่อ
// รันซ้ำได้: ไฟล์ที่มีรูปย่อแล้วถูกข้าม · ใบที่ยังไม่มีรูปย่อ หน้าจอใช้ไฟล์เดิมแทน (ไม่มีอะไรพัง)
// sharp ติดมากับ Next.js (node_modules/sharp) — ไม่ต้องลงเพิ่ม · อ่าน .env.local แบบเดียวกับ scripts/sync-cost-items-from-claims.mjs
//
// scripts/cleanup-storage.mjs (ตั้งแต่ v1.27.0) นับรูปย่อ _thumb.jpg ของไฟล์ที่ยังถูกอ้างถึงเป็นไฟล์ที่ใช้อยู่ — ไม่ลบรูปย่อที่สร้างด้วยสคริปต์นี้

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const APPLY = process.argv.includes('apply')
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i > -1 ? Number(process.argv[i + 1]) : null })()
const BUCKET = 'receipts'
// ต้องตรงกับ lib/finance/receipt-thumbs.ts (THUMB_SUFFIX / THUMB_MAX_DIMENSION)
const THUMB_SUFFIX = '_thumb.jpg'
const THUMB_MAX_DIMENSION = 320
const CONCURRENCY = 4

/** เหมือน thumbPathFor ใน lib/finance/receipt-thumbs.ts: 'claims/EXP-1/1_0.jpg' → 'claims/EXP-1/1_0_thumb.jpg' */
function thumbPathFor(path) {
  if (path.endsWith(THUMB_SUFFIX)) return path
  const slash = path.lastIndexOf('/')
  const name = path.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  return `${path.slice(0, slash + 1)}${stem}${THUMB_SUFFIX}`
}
const isImage = name => /\.(jpe?g|png|webp)$/i.test(name) && !name.endsWith(THUMB_SUFFIX)
const kb = b => (b / 1024).toFixed(0) + ' KB'
const mb = b => (b / 1024 / 1024).toFixed(1) + ' MB'

// ── env ────────────────────────────────────────────────────────────────────
let env
try {
  env = Object.fromEntries(
    fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
      .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
  )
} catch {
  console.error('ไม่พบไฟล์ .env.local ที่รากของโปรเจกต์ — ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('.env.local ไม่มี NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (LIMIT !== null && !(LIMIT > 0)) {
  console.error('--limit ต้องเป็นจำนวนเต็มบวก เช่น --limit 10')
  process.exit(1)
}

// ── sharp (ติดมากับ Next.js ไม่ได้อยู่ใน package.json) ─────────────────────────────
let sharp = null
try {
  sharp = (await import('sharp')).default
} catch (e) {
  const msg = 'ไม่พบ sharp ใน node_modules (ติดมากับ Next.js) — รัน `npm install` ที่รากของโปรเจกต์แล้วลองใหม่'
  if (APPLY) {
    console.error(`${msg}\n(${e.message})`)
    process.exit(1)
  }
  console.warn(`คำเตือน: ${msg} — dry-run ยังนับไฟล์ให้ได้ แต่ apply จะทำไม่ได้`)
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// เดินโฟลเดอร์ receipts แบบ recursive ผ่าน Storage API (claims/EXP-xxx/file) — แบบเดียวกับ scripts/recompress-receipts.mjs
async function allObjects(prefix = '') {
  const out = []
  let offset = 0
  for (;;) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset })
    if (error) { console.error(`list ${prefix || '/'}:`, error.message); process.exit(1) }
    if (!data.length) break
    for (const e of data) {
      const full = prefix ? `${prefix}/${e.name}` : e.name
      if (e.id === null || e.metadata == null) out.push(...await allObjects(full)) // โฟลเดอร์
      else out.push({ name: full, size: Number(e.metadata?.size || 0) })
    }
    if (data.length < 1000) break
    offset += 1000
  }
  return out
}

console.log(`\n=== Backfill Receipt Thumbnails (${APPLY ? 'APPLY — สร้างรูปย่อจริง' : 'DRY-RUN'}) ===`)
const objs = await allObjects()
const names = new Set(objs.map(o => o.name))
const images = objs.filter(o => isImage(o.name))
const haveThumb = images.filter(o => names.has(thumbPathFor(o.name)))
let todo = images.filter(o => !names.has(thumbPathFor(o.name)))
// ชื่อเดียวกันต่างนามสกุล (1_0.png + 1_0.jpg) ได้ path รูปย่อเดียวกัน → ทำตัวแรก ที่เหลือข้าม
const claimed = new Set()
const clashes = []
todo = todo.filter(o => {
  const t = thumbPathFor(o.name)
  if (claimed.has(t)) { clashes.push(o.name); return false }
  claimed.add(t)
  return true
})
if (LIMIT) todo = todo.slice(0, LIMIT)

console.log(`ไฟล์ทั้งหมดใน ${BUCKET}: ${objs.length} · ไฟล์รูป: ${images.length} (${mb(images.reduce((s, o) => s + o.size, 0))})`)
console.log(`มีรูปย่อแล้ว (ข้าม): ${haveThumb.length} · ชื่อซ้ำต่างนามสกุล (ข้าม): ${clashes.length}`)
console.log(`จะสร้างรูปย่อ: ${todo.length}${LIMIT ? ` (จำกัด ${LIMIT})` : ''} · ประมาณ ${mb(todo.length * 15 * 1024)} (ราว 15KB ต่อรูป)`)
for (const o of todo.slice(0, 15)) console.log(`  ${o.name} (${kb(o.size)}) → ${thumbPathFor(o.name)}`)
if (todo.length > 15) console.log(`  … อีก ${todo.length - 15} ไฟล์`)

if (!APPLY) {
  console.log('\nนี่คือ dry-run — ยังไม่เขียนอะไร. ลองจริงก่อนด้วย: node scripts/backfill-receipt-thumbs.mjs apply --limit 10')
  console.log('แล้วเปิดหน้าใบเบิกของไฟล์เหล่านั้นดูว่ารูปย่อขึ้น จากนั้น: node scripts/backfill-receipt-thumbs.mjs apply')
  process.exit(0)
}

// ── สร้างจริง ─────────────────────────────────────────────────────────────────
let created = 0, existed = 0, errors = 0, written = 0
async function makeThumb(o) {
  const thumb = thumbPathFor(o.name)
  if (thumb === o.name) throw new Error('path ของรูปย่อตรงกับไฟล์เดิม — ไม่เขียน') // กันเขียนทับไฟล์เดิมทุกกรณี
  const { data, error } = await sb.storage.from(BUCKET).download(o.name)
  if (error) throw new Error(`download: ${error.message}`)
  const out = await sharp(Buffer.from(await data.arrayBuffer()))
    .rotate()
    .resize({ width: THUMB_MAX_DIMENSION, height: THUMB_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 75 })
    .toBuffer()
  const { error: upErr } = await sb.storage.from(BUCKET).upload(thumb, out, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  })
  if (upErr) {
    if (/exist|duplicate/i.test(upErr.message)) { existed++; return }
    throw new Error(`upload: ${upErr.message}`)
  }
  created++
  written += out.length
  if (created <= 15 || created % 200 === 0) console.log(`  ${created <= 15 ? '' : `[${created}] `}${thumb}  ${kb(o.size)} → ${kb(out.length)}`)
}

console.log('\nเริ่มสร้าง...')
for (let i = 0; i < todo.length; i += CONCURRENCY) {
  await Promise.all(todo.slice(i, i + CONCURRENCY).map(o =>
    makeThumb(o).catch(e => { errors++; console.error('  ไม่สำเร็จ', o.name, e.message) })
  ))
}

console.log(`\nสร้างรูปย่อ ${created} ไฟล์ (${mb(written)}) · มีอยู่แล้ว ${existed} · ไม่สำเร็จ ${errors}`)
console.log('ไฟล์เดิมไม่ถูกแตะ ไม่ต้องแก้ฐานข้อมูล' + (errors ? ' — ไฟล์ที่ไม่สำเร็จ รันคำสั่งเดิมซ้ำได้ (ข้ามที่ทำแล้ว)' : ''))
