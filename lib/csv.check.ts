// ชุดตรวจความปลอดภัยรอบ 4 (Low): L2 csvCell + ไฟล์ CSV ที่ใช้ · L5 cron secret · L7 payment-voucher id
// Run:  npx tsx lib/csv.check.ts
// ไม่แตะฐานข้อมูล/เครือข่ายจริง: แทน supabase-server, auth, claim-voucher, metrics-lib ด้วยตัวจำลองผ่าน Module._load
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "csv: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { csvCell } from './csv'

const ROOT = join(__dirname, '..')
const env = process.env as Record<string, string | undefined>

// ── L2: csvCell ────────────────────────────────────────────────────────────────
assert.equal(csvCell('=1+1'), "'=1+1")
assert.equal(csvCell('=HYPERLINK("http://x","a")'), `"'=HYPERLINK(""http://x"",""a"")"`)
assert.equal(csvCell('+66812345678'), '+66812345678', 'ตัวเลขล้วนไม่เติม')
assert.equal(csvCell('+cmd'), "'+cmd")
assert.equal(csvCell('-2+3'), "'-2+3")
assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)")
assert.equal(csvCell('\t=1'), `'\t=1`)
assert.equal(csvCell('\r=1'), `"'\r=1"`)
assert.equal(csvCell('  =1'), "'  =1", 'ช่องว่างนำหน้าแล้วตามด้วย =')
assert.equal(csvCell('a,b'), '"a,b"')
assert.equal(csvCell('say "hi"'), '"say ""hi"""')
assert.equal(csvCell('line1\nline2'), '"line1\nline2"')
assert.equal(csvCell('ok'), 'ok')
assert.equal(csvCell('ไทย'), 'ไทย')
assert.equal(csvCell(null), '')
assert.equal(csvCell(undefined), '')
assert.equal(csvCell(42), '42')
assert.equal(csvCell(-100), '-100', 'ตัวเลขติดลบยังเป็นตัวเลข')
assert.equal(csvCell('-100.0'), '-100.0')
assert.equal(csvCell(0), '0')
console.log('PASS  csvCell กัน = + - @ tab CR · escape , " ขึ้นบรรทัด · null/ตัวเลข')

// ── L2: ทุกไฟล์ที่สร้าง CSV ต้อง import csvCell และไม่ห่อค่าดิบด้วย `"${...}"` แล้ว ──────
const CSV_FILES = [
  'app/(authenticated)/costs/download/download-view.tsx',
  'app/(authenticated)/crm/download/download-view.tsx',
  'app/(authenticated)/kpi/download/download-view.tsx',
  'app/(authenticated)/overview/overview-view.tsx',
  'app/(authenticated)/overview/analytics-panel.tsx',
  'app/(authenticated)/overview/export/export-view.tsx',
]
for (const f of CSV_FILES) {
  const src = readFileSync(join(ROOT, f), 'utf8')
  assert.match(src, /import \{ csvCell \} from '@\/lib\/csv'/, `${f} ต้อง import csvCell`)
  assert.ok((src.match(/csvCell/g) || []).length >= 2, `${f} ต้องเรียก csvCell`)
  assert.doesNotMatch(src, /`"\$\{/, `${f} ยังห่อค่าดิบด้วย "\${...}"`)
}
console.log(`PASS  ไฟล์ CSV ${CSV_FILES.length} ไฟล์ใช้ csvCell`)

// ── ตัวจำลองโมดูล ───────────────────────────────────────────────────────────────
// query builder ที่ต่อ method ได้เรื่อยๆ และ await แล้วได้ { data: [], error: null }
function chain(): unknown {
  const target = () => {}
  return new Proxy(target, {
    get: (_t, prop) => prop === 'then'
      ? (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
      : () => chain(),
  })
}
const fakeClient = { from: () => chain() }
const mocks: [RegExp, unknown][] = [
  [/lib\/supabase-server$/, { createServiceClient: () => fakeClient }],
  [/lib\/auth$/, { requireAuth: async () => null }],
  [/lib\/claim-voucher$/, { VOUCHER_CLAIM_SELECT: '*', buildVoucherData: async () => ({}), canViewClaimDocs: () => true, renderVoucherPdf: async () => new Uint8Array() }],
  [/content-planner\/metrics-lib$/, { fetchMetricsForUrl: async () => ({ error: 'x' }) }],
]
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  return hit ? hit[1] : realLoad.call(this, request, ...rest)
}

const load = createRequire(__filename)
const cron = load('../app/api/cron/fetch-metrics/route') as typeof import('../app/api/cron/fetch-metrics/route')
const voucher = load('../app/api/pdf/payment-voucher/route') as typeof import('../app/api/pdf/payment-voucher/route')

async function main() {
  // ── L5: cron secret ──────────────────────────────────────────────────────────
  const URL_ = 'http://localhost/api/cron/fetch-metrics'
  const SECRET = 'cron-secret-xyz'
  const bearer = (s: string) => new Request(URL_, { headers: { authorization: `Bearer ${s}` } })

  delete env.CRON_SECRET
  assert.equal((await cron.GET(new Request(URL_))).status, 403, 'ไม่ตั้ง env')
  assert.equal((await cron.GET(bearer(SECRET))).status, 403, 'ไม่ตั้ง env แม้ส่ง bearer')
  assert.equal((await cron.GET(new Request(`${URL_}?secret=`))).status, 403, 'ไม่ตั้ง env query ว่าง')
  env.CRON_SECRET = ''
  assert.equal((await cron.GET(bearer(''))).status, 403, 'env ว่าง')
  console.log('PASS  ไม่ตั้ง CRON_SECRET → 403 เสมอ')

  env.CRON_SECRET = SECRET
  assert.equal((await cron.GET(new Request(URL_))).status, 403, 'ไม่ส่งอะไร')
  assert.equal((await cron.GET(bearer('wrong'))).status, 403, 'bearer ผิด')
  assert.equal((await cron.GET(bearer(`${SECRET}x`))).status, 403, 'bearer ยาวกว่า')
  assert.equal((await cron.POST(new Request(URL_, { method: 'POST', headers: { 'x-cron-secret': 'wrong' } }))).status, 403, 'x-cron-secret ผิด')
  assert.equal((await cron.GET(new Request(`${URL_}?secret=wrong`))).status, 403, 'query ผิด')
  console.log('PASS  secret ผิด (bearer / x-cron-secret / query) → 403')

  assert.notEqual((await cron.GET(bearer(SECRET))).status, 403, 'bearer ถูก')
  assert.notEqual((await cron.POST(new Request(URL_, { method: 'POST', headers: { 'x-cron-secret': SECRET } }))).status, 403, 'x-cron-secret ถูก')
  const warn = console.warn
  const warned: unknown[] = []
  console.warn = (...a: unknown[]) => { warned.push(a) }
  try {
    assert.notEqual((await cron.GET(new Request(`${URL_}?secret=${SECRET}`))).status, 403, 'query ถูก (ทางเดิม)')
  } finally {
    console.warn = warn
  }
  assert.equal(warned.length, 1, 'ทางเดิม ?secret= ต้อง console.warn เลิกใช้')
  console.log('PASS  secret ถูก (bearer / x-cron-secret / ?secret= + warn) → ไม่ใช่ 403')

  // ── L7: payment-voucher ตรวจ id ──────────────────────────────────────────────
  const { NextRequest } = await import('next/server')
  const pv = (q: string) => voucher.GET(new NextRequest(`http://localhost/api/pdf/payment-voucher${q}`))
  assert.equal((await pv('?id=abc')).status, 400, 'id=abc')
  assert.equal((await pv(`?id=${'a'.repeat(35)}'`)).status, 400, 'id มีอักขระแปลก')
  assert.equal((await pv('')).status, 400, 'ไม่ส่ง id')
  assert.equal((await pv('?id=00000000-0000-4000-8000-000000000001')).status, 401, 'id ถูกรูป ไม่ล็อกอิน → 401')
  console.log('PASS  payment-voucher id ไม่ใช่ UUID → 400')

  console.log('\ncsv: ผ่านทั้งหมด')
}

main().catch(err => { console.error(err); process.exit(1) })
