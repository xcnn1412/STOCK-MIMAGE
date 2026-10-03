// Run: npx tsx scripts/safe-next.check.ts
import assert from 'node:assert/strict'
import { safeNext } from '../lib/safe-next'

assert.equal(safeNext('/shelves/abc'), '/shelves/abc')
assert.equal(safeNext('/kits/1/check?eventId=2'), '/kits/1/check?eventId=2')
// เว็บอื่น / protocol-relative / backslash trick → dashboard
assert.equal(safeNext('https://evil.com'), '/dashboard')
assert.equal(safeNext('//evil.com'), '/dashboard')
assert.equal(safeNext('/\\evil.com'), '/dashboard')
// ว่าง / ไม่ใช่ string / วนกลับหน้า login → dashboard
assert.equal(safeNext(''), '/dashboard')
assert.equal(safeNext(null), '/dashboard')
assert.equal(safeNext('/login?next=/x'), '/dashboard')

console.log('safe-next.check: all passed')
