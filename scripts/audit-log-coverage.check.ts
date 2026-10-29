// ชุดตรวจแบบ static (ไม่แตะฐานข้อมูล) — L19 ใน docs/SECURITY_REPORT.md
// 1) mutation ในรายการต้องเรียก logActivity( ในตัวฟังก์ชัน (นับจาก `export async function ชื่อ(` ถึง export async function ถัดไป)
// 2) ทุก ActionType ที่ใช้ใน logActivity('X' ใต้ app/ และ lib/ ต้องมีอยู่ใน union ของ lib/logger.ts
// รัน: npx tsx scripts/audit-log-coverage.check.ts
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const MUST_LOG: Record<string, string[]> = {
  'app/(authenticated)/check-in/actions.ts': ['checkIn', 'checkOut', 'undoCheckout', 'quickCheckoutStale', 'adminCheckIn', 'updateMyCheckinEvent'],
  'app/(authenticated)/jobs/actions.ts': ['createJobType', 'updateJobType', 'deleteJobType'],
  'app/(authenticated)/events/actions.ts': ['uploadClosureImage'],
  'app/(authenticated)/finance/actions.ts': ['updateClaim', 'removeReceiptFile', 'uploadTaxInvoice', 'setTaxInvoiceEntries', 'recreateCostItemFromClaim'],
  'app/(authenticated)/sales-board/actions.ts': ['saveMonthTargets'],
  'app/(authenticated)/items/cleanup-items.ts': ['cleanupOrphanedItems'],
  'app/(authenticated)/packing/actions.ts': ['uploadPackingPhoto', 'uploadReturnPhoto'],
  'app/(authenticated)/checkupdate/actions.ts': ['markMigrationApplied', 'unmarkMigrationApplied'],
}

function body(src: string, name: string): string | null {
  const start = src.indexOf(`export async function ${name}(`)
  if (start < 0) return null
  const next = src.indexOf('export async function ', start + 1)
  return src.slice(start, next < 0 ? undefined : next)
}

const missingLog: string[] = []
for (const [file, names] of Object.entries(MUST_LOG)) {
  const src = read(file)
  for (const name of names) {
    const b = body(src, name)
    if (b === null) missingLog.push(`${file}::${name} (ไม่พบฟังก์ชัน)`)
    else if (!b.includes('logActivity(')) missingLog.push(`${file}::${name}`)
  }
}
assert.deepEqual(missingLog, [], `ฟังก์ชันที่ยังไม่ log:\n${missingLog.join('\n')}`)
console.log('✓ mutation ในรายการ L19 เรียก logActivity ครบ')

// union ของ ActionType
const logger = read('lib/logger.ts')
const unionSrc = logger.match(/export type ActionType =([\s\S]*?)\n\s*\n/)
assert.ok(unionSrc, 'หา union ActionType ใน lib/logger.ts ไม่เจอ')
const union = new Set([...unionSrc[1].matchAll(/\|\s*'([A-Z0-9_]+)'/g)].map(m => m[1]))
assert.ok(union.size > 50, `union สั้นผิดปกติ (${union.size})`)

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const rel = `${dir}/${name}`
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.check.ts')) out.push(rel)
  }
  return out
}

const unknown: string[] = []
for (const file of [...walk('app'), ...walk('lib')]) {
  for (const m of read(file).matchAll(/logActivity\(\s*'([A-Za-z0-9_]+)'/g)) {
    if (!union.has(m[1])) unknown.push(`${file}: ${m[1]}`)
  }
}
assert.deepEqual(unknown, [], `ActionType ที่ไม่มีใน union:\n${unknown.join('\n')}`)
console.log(`✓ ActionType ที่ใช้ใน app/ lib/ อยู่ใน union ครบ (${union.size} ค่า)`)

console.log('audit-log-coverage: ผ่านทั้งหมด')
