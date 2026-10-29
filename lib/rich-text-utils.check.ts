/**
 * lib/rich-text-utils.check.ts — ตรวจ sanitizer ของ rich text (H2/H3/M12) ไม่แตะ DB/เครือข่าย
 *
 *   npx tsx lib/rich-text-utils.check.ts
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { sanitizeHtml, prepareContentForRender } from './rich-text-utils'
import { sanitizeHtml as docSanitizeHtml } from '../app/(authenticated)/documents/doc-types'

const BAD = /onerror|onload|onclick|<iframe|<svg|<form|<img|<script|javascript:/i

// AC2.1 — payload อันตรายต้องหายหมด
const attacks = [
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="java&#115;cript:alert(1)">x</a>',
  '<p onclick=alert(1)>x</p>',
  '<form><input></form>',
  '<p>a</p><script>alert(1)</script>',
]
for (const a of attacks) {
  const out = sanitizeHtml(a)
  assert.ok(!BAD.test(out), `ยังเหลือของอันตราย: ${a} → ${out}`)
}

// ของที่ editor ผลิตจริงต้องรอดไม่เปลี่ยน
const keep = [
  '<p>สวัสดี <strong>ครับ</strong></p>',
  '<p><span class="mention" data-type="mention" data-id="11111111-2222-3333-4444-555555555555" data-label="สมชาย">@สมชาย</span></p>',
  '<p><span style="color: rgb(220, 38, 38)">x</span></p>',
  '<p><mark data-color="#fef08a">x</mark></p>',
  '<ul><li><p>a</p></li></ul><ol><li><p>b</p></li></ol>',
  '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">ลิงก์</a> <a href="mailto:a@b.co">เมล</a></p>',
]
for (const k of keep) assert.equal(sanitizeHtml(k), k, `ของดีโดนแก้: ${k}`)

// plain text — escape ก่อนห่อ <p>
assert.equal(prepareContentForRender('<script>x</script>\nline2'), '<p>&lt;script&gt;x&lt;/script&gt;</p><p>line2</p>')
// mention แบบเก่าใน plain text → span
assert.equal(
  prepareContentForRender('ถึง @[สมชาย](abc-123) นะ'),
  '<p>ถึง <span class="mention" data-type="mention" data-id="abc-123">@สมชาย</span> นะ</p>',
)
// HTML branch ผ่าน sanitizer
assert.ok(!BAD.test(prepareContentForRender('<p>x</p><img src=x onerror=alert(1)>')))

// documents/doc-types.ts ให้ผลเดียวกันทุกไบต์
for (const x of [...attacks, ...keep]) assert.equal(docSanitizeHtml(x), sanitizeHtml(x), `doc-types ต่าง: ${x}`)

// AC2.2 — dropdown mention ไม่ประกอบค่าจาก DB ลง HTML โดยไม่ escape
const editorSrc = fs.readFileSync(path.join(__dirname, '../components/rich-text-editor.tsx'), 'utf8')
// ไล่ทุก ${ (รวมที่ซ้อนใน template ลูก) อ่านจนถึง } หรือ ` ตัวแรก
const exprs = [...editorSrc.matchAll(/\$\{([^}`]*)/g)].map(m => m[1]).filter(e => e.includes('user.'))
// ยกเว้นแค่เงื่อนไข ternary (`${user.department ? `…` : ''}`) — ค่าข้างในถูกตรวจแยกเป็น ${ ของมันเอง
const unsafe = exprs.filter(e => !e.trimStart().startsWith('escapeHtml(') && !/^\s*user\.\w+\s*\?\s*$/.test(e))
assert.deepEqual(unsafe, [], `rich-text-editor.tsx ยังมี \${user.…} ไม่ผ่าน escapeHtml: ${unsafe.join(' | ')}`)

console.log('rich-text-utils: ผ่านทั้งหมด')
