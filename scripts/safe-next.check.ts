// Run: npx tsx scripts/safe-next.check.ts
import assert from 'node:assert/strict'
import { safeNext } from '../lib/safe-next'

assert.equal(safeNext('/shelves/abc'), '/shelves/abc')
assert.equal(safeNext('/kits/1/check?eventId=2'), '/kits/1/check?eventId=2')
// เว็บอื่น / protocol-relative / backslash trick → dashboard
assert.equal(safeNext('https://evil.com'), '/dashboard')
assert.equal(safeNext('//evil.com'), '/dashboard')
assert.equal(safeNext('/\\evil.com'), '/dashboard')
// control char / ช่องว่าง / backslash / %xx ที่ถอดแล้วเป็นตัวต้องห้าม (L3) → dashboard
assert.equal(safeNext('/%09/evil.com'), '/dashboard')
assert.equal(safeNext('/\t/evil.com'), '/dashboard')
assert.equal(safeNext('/%2F/evil.com'), '/dashboard')
assert.equal(safeNext('/a/\\evil.com'), '/dashboard')
assert.equal(safeNext('/ /evil.com'), '/dashboard')
assert.equal(safeNext('/a\u0000b'), '/dashboard')
assert.equal(safeNext('/a\nb'), '/dashboard')
assert.equal(safeNext('/%E0%A4%A'), '/dashboard')
// path ไทย / ช่องว่างที่เข้ารหัส %xx ยังผ่าน
assert.equal(safeNext('/crm?q=a%20b'), '/crm?q=a%20b')
assert.equal(safeNext('/crm?q=%E0%B8%81'), '/crm?q=%E0%B8%81')
// ว่าง / ไม่ใช่ string / วนกลับหน้า login → dashboard
assert.equal(safeNext(''), '/dashboard')
assert.equal(safeNext(null), '/dashboard')
assert.equal(safeNext('/login?next=/x'), '/dashboard')

console.log('safe-next.check: all passed')
