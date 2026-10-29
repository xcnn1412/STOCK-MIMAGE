// สิทธิ์ items / example-kits (H6, M17) + กติการูปอุปกรณ์ — ไม่แตะฐานข้อมูล/เครือข่าย
// Run:  npx tsx scripts/items-access.check.ts
// 1) AC2.6 static scan: ทุก `export async function` ในไฟล์ action ต้องเรียก requireModule( หรือ getKitManager( ภายใน 6 บรรทัดแรกของตัวฟังก์ชัน
// 2) unit: keepOwnImages / parseImageUrls / isAllowedImage (app/(authenticated)/items/image-logic.ts)
// บรรทัดสุดท้ายต้องเป็น "items-access: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { keepOwnImages, parseImageUrls, isAllowedImage, MAX_IMAGE_BYTES } from '../app/(authenticated)/items/image-logic'

const root = join(__dirname, '..')
const FILES = [
  'app/(authenticated)/items/actions.ts',
  'app/(authenticated)/items/[id]/actions.ts',
  'app/(authenticated)/items/cleanup-items.ts',
  'app/(authenticated)/example-kits/actions.ts',
  'app/(authenticated)/example-kits/[id]/actions.ts',
]

// ── 1) static scan ────────────────────────────────────────────────────────
const offenders: string[] = []
let exportCount = 0
for (const rel of FILES) {
  const lines = readFileSync(join(root, rel), 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    const m = /^export async function (\w+)/.exec(line)
    if (!m) return
    exportCount++
    // หาบรรทัดเปิดตัวฟังก์ชัน: ปิดวงเล็บพารามิเตอร์ก่อน (signature อาจยาวหลายบรรทัด) แล้วบรรทัดแรกที่ลงท้ายด้วย {
    let open = i
    let depth = 0
    let closed = false
    for (; open < lines.length; open++) {
      for (const ch of lines[open]) {
        if (closed) break
        if (ch === '(') depth++
        else if (ch === ')' && --depth === 0) closed = true
      }
      if (closed && /\{\s*$/.test(lines[open])) break
    }
    const body = lines.slice(open + 1, open + 7).join('\n')
    if (!/requireModule\(|getKitManager\(/.test(body)) offenders.push(`${rel}:${i + 1} ${m[1]}`)
  })
}
assert.ok(exportCount >= 11, `ควรพบ export อย่างน้อย 11 ตัว แต่พบ ${exportCount}`)
assert.deepEqual(offenders, [], `export ที่ไม่มีด่านสิทธิ์:\n${offenders.join('\n')}`)
console.log(`PASS  AC2.6 ทุก export (${exportCount} ตัว) มี requireModule/getKitManager ใน 6 บรรทัดแรก`)

// ── 2) keepOwnImages ──────────────────────────────────────────────────────
const A = 'https://x.supabase.co/storage/v1/object/public/item-images/a.jpg'
const B = 'https://x.supabase.co/storage/v1/object/public/item-images/b.jpg'
const EVIL = 'https://evil.example/c.jpg'
const arr = JSON.stringify([A, B])

assert.deepEqual(keepOwnImages(JSON.stringify([A, EVIL, B]), arr), [A, B])
assert.deepEqual(keepOwnImages(JSON.stringify([B]), arr), [B])
assert.deepEqual(keepOwnImages([A, EVIL], arr), [A], 'รับ array ตรงได้')
assert.deepEqual(keepOwnImages(JSON.stringify([A, A]), arr), [A], 'ตัดซ้ำ')
console.log('PASS  keepOwnImages: image_url แบบ JSON array เก็บเฉพาะ URL เดิม')

assert.deepEqual(keepOwnImages(JSON.stringify([A, EVIL]), A), [A])
assert.deepEqual(keepOwnImages(JSON.stringify([B]), A), [])
console.log('PASS  keepOwnImages: image_url แบบ URL เดี่ยว')

assert.deepEqual(keepOwnImages('{not json', arr), [])
assert.deepEqual(keepOwnImages(JSON.stringify({ a: A }), arr), [])
assert.deepEqual(keepOwnImages(JSON.stringify([A]), '[broken'), [])
assert.deepEqual(keepOwnImages(JSON.stringify([A]), null), [])
assert.deepEqual(keepOwnImages(null, arr), [])
assert.deepEqual(keepOwnImages('', arr), [])
assert.deepEqual(keepOwnImages(JSON.stringify([EVIL, 42, null]), arr), [])
console.log('PASS  keepOwnImages: JSON เสีย / null / ไม่ตรงเลย = []')

assert.deepEqual(parseImageUrls(arr), [A, B])
assert.deepEqual(parseImageUrls(A), [A])
assert.deepEqual(parseImageUrls(null), [])
assert.deepEqual(parseImageUrls('[oops'), [])
console.log('PASS  parseImageUrls')

// ── 3) isAllowedImage ─────────────────────────────────────────────────────
assert.equal(isAllowedImage({ type: 'image/jpeg', size: 1000 }), true)
assert.equal(isAllowedImage({ type: 'image/png', size: MAX_IMAGE_BYTES }), true)
assert.equal(isAllowedImage({ type: 'image/webp', size: 1 }), true)
assert.equal(isAllowedImage({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 }), false)
assert.equal(isAllowedImage({ type: 'image/svg+xml', size: 100 }), false)
assert.equal(isAllowedImage({ type: 'text/html', size: 100 }), false)
assert.equal(isAllowedImage({ type: '', size: 100 }), false)
console.log('PASS  isAllowedImage: jpeg/png/webp ≤ 5MB เท่านั้น')

console.log('items-access: ผ่านทั้งหมด')
