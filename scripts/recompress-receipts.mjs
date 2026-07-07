// บีบอัดใบเสร็จใน bucket `receipts` ทับที่เดิม — เฟส 3 (ไม่ลบ, public URL ไม่เปลี่ยน = ไม่ต้องแก้ DB)
//
// รัน:  node scripts/recompress-receipts.mjs                 (dry-run: สุ่มชิม 20 ไฟล์ ประเมินพื้นที่ที่จะประหยัด)
//       node scripts/recompress-receipts.mjs --limit 10 --apply   (บีบจริง 10 ไฟล์แรก — ไว้ตรวจความชัดก่อน)
//       node scripts/recompress-receipts.mjs --apply            (บีบจริงทั้งหมด)
//
// บีบเฉพาะไฟล์รูป (.jpg/.jpeg/.png/.webp), ข้าม PDF/อื่นๆ, และบีบเฉพาะเมื่อผลเล็กลง >10%
// sharp ติดมากับ Next.js (node_modules/sharp) — ไม่ต้องลงเพิ่ม

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import fs from 'fs'

const APPLY = process.argv.includes('--apply')
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i > -1 ? Number(process.argv[i + 1]) : null })()
const SAMPLE = APPLY ? Infinity : 20

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const mb = b => (b / 1024 / 1024).toFixed(1) + ' MB'
const isImg = n => /\.(jpe?g|png|webp)$/i.test(n)

// เดินโฟลเดอร์ receipts แบบ recursive ผ่าน Storage API (claims/EXP-xxx/file)
async function allObjects(prefix = '') {
  let out = [], offset = 0
  for (;;) {
    const { data, error } = await sb.storage.from('receipts').list(prefix, { limit: 1000, offset })
    if (error) { console.error(error.message); process.exit(1) }
    if (!data.length) break
    for (const e of data) {
      const full = prefix ? `${prefix}/${e.name}` : e.name
      if (e.id === null || e.metadata == null) out.push(...await allObjects(full)) // โฟลเดอร์
      else out.push({ name: full, metadata: e.metadata })
    }
    if (data.length < 1000) break
    offset += 1000
  }
  return out
}

let objs = (await allObjects()).filter(o => isImg(o.name))
if (LIMIT) objs = objs.slice(0, LIMIT)

console.log(`\n=== Recompress Receipts (${APPLY ? 'APPLY — เขียนทับจริง' : 'DRY-RUN'}) ===`)
console.log(`ไฟล์รูปทั้งหมดใน receipts: ${objs.length}${LIMIT ? ` (จำกัด ${LIMIT})` : ''}`)

let processed = 0, shrunk = 0, oldSum = 0, newSum = 0, skipped = 0, errors = 0
const toScan = APPLY ? objs : objs.slice(0, SAMPLE)

for (const o of toScan) {
  try {
    const { data, error } = await sb.storage.from('receipts').download(o.name)
    if (error) { errors++; continue }
    const buf = Buffer.from(await data.arrayBuffer())
    const out = await sharp(buf).rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72 }).toBuffer()
    processed++
    if (out.length >= buf.length * 0.9) { skipped++; continue }  // เล็กลงไม่ถึง 10% → ข้าม
    shrunk++; oldSum += buf.length; newSum += out.length
    if (APPLY) {
      const { error: upErr } = await sb.storage.from('receipts')
        .upload(o.name, out, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) { console.error('upload', o.name, upErr.message); errors++; continue }
    }
    if (shrunk <= 15 || shrunk % 200 === 0)
      console.log(`  ${shrunk <= 15 ? '' : `[${shrunk}] `}${o.name}  ${mb(buf.length)} → ${mb(out.length)}`)
  } catch (e) { console.error('sharp', o.name, e.message); errors++ }
}

const saved = oldSum - newSum
console.log(`\nประมวลผล ${processed} | บีบได้ ${shrunk} | ข้าม(เล็กแล้ว) ${skipped} | error ${errors}`)
console.log(`ประหยัดจากตัวอย่างนี้: ${mb(saved)} (${oldSum ? Math.round(saved / oldSum * 100) : 0}%)`)
if (!APPLY) {
  const ratio = shrunk ? saved / oldSum : 0
  // ประเมินทั้ง bucket: สมมติสัดส่วนประหยัดเท่ากันกับไฟล์รูปที่เหลือ
  const allImgBytes = objs.reduce((s, o) => s + Number(o.metadata?.size || 0), 0)
  console.log(`\nคาดการณ์ทั้ง bucket (${objs.length} รูป, ${mb(allImgBytes)}): ประหยัด ~${mb(allImgBytes * ratio)}`)
  console.log('นี่คือ dry-run — ยังไม่เขียนอะไร. ตรวจความชัดด้วย: node scripts/recompress-receipts.mjs --limit 10 --apply')
} else {
  console.log('เสร็จ. public URL ไม่เปลี่ยน — ไม่ต้องแก้ DB. เช็คใบเสร็จตัวอย่างว่ายังชัดอ่านออก')
}
