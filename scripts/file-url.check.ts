// ============================================================================
// ชุดตรวจ M3 — บัคเก็ตส่วนตัว: lib/file-url.ts · GET /api/file/[bucket]/[...path] · fetchClaimFile · static scan หน้าจอ
// ไม่แตะฐานข้อมูล/สตอเรจจริง: ดัก Module._load แทน @/lib/auth และ @/lib/supabase-server
// รัน:  npx tsx scripts/file-url.check.ts   (บรรทัดสุดท้ายต้องเป็น "file-url: ผ่านทั้งหมด")
// ============================================================================

import assert from 'node:assert/strict'
import Module from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'https://abcd.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_URL = BASE

// ─── ของปลอม ────────────────────────────────────────────────────────────────
let session: { userId: string; role: string; sessionId: string } | null = null
const signCalls: { bucket: string; path: string; ttl: number }[] = []
const downloadCalls: { bucket: string; path: string }[] = []
let downloadBlob: Blob | null = null
let signError = false

const fakeStorage = {
  from(bucket: string) {
    return {
      async createSignedUrl(path: string, ttl: number) {
        signCalls.push({ bucket, path, ttl })
        if (signError) return { data: null, error: { message: 'not found' } }
        return { data: { signedUrl: `${BASE}/storage/v1/object/sign/${bucket}/${path}?token=fake` }, error: null }
      },
      async download(path: string) {
        downloadCalls.push({ bucket, path })
        return downloadBlob ? { data: downloadBlob, error: null } : { data: null, error: { message: 'missing' } }
      },
    }
  },
}

type Loader = (request: string, parent: unknown, isMain: boolean) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (request, parent, isMain) {
  if (request === '@/lib/auth') return { requireAuth: async () => session }
  if (request === '@/lib/supabase-server') return { createServiceClient: () => ({ storage: fakeStorage }) }
  return realLoad.call(this, request, parent, isMain)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { appFileUrl, PRIVATE_BUCKETS } = require('../lib/file-url') as typeof import('../lib/file-url')
const { GET } = require('../app/api/file/[bucket]/[...path]/route') as typeof import('../app/api/file/[bucket]/[...path]/route')
const { fetchClaimFile, CLAIM_FILE_MAX_BYTES } = require('../lib/claim-files') as typeof import('../lib/claim-files')

async function main() {
  // ─── 1. appFileUrl ────────────────────────────────────────────────────────
  assert.equal(PRIVATE_BUCKETS.length, 4)
  for (const b of PRIVATE_BUCKETS) {
    assert.equal(
      appFileUrl(`${BASE}/storage/v1/object/public/${b}/u1/claims/EXP%2001/a%20b.jpg`),
      `/api/file/${b}/u1/claims/EXP%2001/a%20b.jpg`, b
    )
  }
  assert.equal(appFileUrl(`${BASE}/storage/v1/object/public/receipts/claims/1/x.jpg?v=123`), '/api/file/receipts/claims/1/x.jpg')
  const itemImg = `${BASE}/storage/v1/object/public/item-images/a/b.png`
  assert.equal(appFileUrl(itemImg), itemImg)
  assert.equal(appFileUrl('/x.png'), '/x.png')
  assert.equal(appFileUrl(''), '')
  assert.equal(appFileUrl(null), '')
  assert.equal(appFileUrl(undefined), '')
  assert.equal(appFileUrl('not a url'), 'not a url')
  assert.equal(appFileUrl('blob:http://localhost/abc'), 'blob:http://localhost/abc')
  // ไม่มี path / มี path อื่นนำหน้า prefix → คืนเดิม
  const noPath = `${BASE}/storage/v1/object/public/receipts/`
  assert.equal(appFileUrl(noPath), noPath)
  const nested = `${BASE}/evil/storage/v1/object/public/receipts/a.jpg`
  assert.equal(appFileUrl(nested), nested)
  // ค่าที่แปลงแล้วแปลงซ้ำไม่เปลี่ยน
  assert.equal(appFileUrl('/api/file/receipts/a.jpg'), '/api/file/receipts/a.jpg')
  console.log('✓ appFileUrl')

  // ─── 2. route ─────────────────────────────────────────────────────────────
  const call = (bucket: string, path: string[]) =>
    GET(new Request(`http://localhost/api/file/${bucket}/${path.join('/')}`), { params: Promise.resolve({ bucket, path }) })

  session = null
  let res = await call('receipts', ['claims', '1', 'x.jpg'])
  assert.equal(res.status, 401)
  assert.ok((await res.json()).error)
  assert.equal(signCalls.length, 0, 'ไม่ล็อกอินต้องไม่ขอ signed URL')

  session = { userId: 'u1', role: 'staff', sessionId: 's1' }
  res = await call('item-images', ['a.png'])
  assert.equal(res.status, 404)
  for (const bad of [['a', '..', 'b'], ['a', '', 'b'], ['.', 'a'], ['a%2Fb'], ['..%2Fx'], []]) {
    res = await call('receipts', bad)
    assert.equal(res.status, 404, JSON.stringify(bad))
  }
  assert.equal(signCalls.length, 0, 'path ผิดต้องไม่ถึงสตอเรจ')

  res = await call('receipts', ['claims', 'EXP%2001', 'a%20b.jpg'])
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), `${BASE}/storage/v1/object/sign/receipts/claims/EXP 01/a b.jpg?token=fake`)
  assert.match(res.headers.get('cache-control') ?? '', /private/)
  assert.match(res.headers.get('cache-control') ?? '', /no-store/)
  assert.deepEqual(signCalls.at(-1), { bucket: 'receipts', path: 'claims/EXP 01/a b.jpg', ttl: 300 })

  for (const b of PRIVATE_BUCKETS) {
    res = await call(b, ['u1', 'p.webp'])
    assert.equal(res.status, 302, b)
  }

  signError = true
  res = await call('checkin-photos', ['u1', 'gone.webp'])
  assert.equal(res.status, 404)
  signError = false
  console.log('✓ route /api/file')

  // ─── 3. fetchClaimFile ────────────────────────────────────────────────────
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => { throw new Error('fetch ต้องไม่ถูกเรียก') }) as typeof fetch
  try {
    downloadBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
    const got = await fetchClaimFile(`${BASE}/storage/v1/object/public/receipts/claims/EXP%2001/1_0.jpg?v=1`)
    assert.ok('bytes' in got, JSON.stringify(got))
    assert.deepEqual([...got.bytes], [1, 2, 3])
    assert.equal(got.contentType, 'image/jpeg')
    assert.deepEqual(downloadCalls.at(-1), { bucket: 'receipts', path: 'claims/EXP 01/1_0.jpg' })

    downloadBlob = new Blob([new Uint8Array(CLAIM_FILE_MAX_BYTES + 1)])
    const big = await fetchClaimFile(`${BASE}/storage/v1/object/public/receipts/claims/1/big.pdf`)
    assert.deepEqual(big, { failReason: 'too-large' })

    downloadBlob = null
    assert.deepEqual(await fetchClaimFile(`${BASE}/storage/v1/object/public/receipts/claims/1/none.jpg`), { failReason: 'fetch' })

    // URL ภายนอก / บัคเก็ตอื่น → foreign-host ไม่ดาวน์โหลด
    const before = downloadCalls.length
    assert.deepEqual(await fetchClaimFile('https://evil.example/storage/v1/object/public/receipts/a.jpg'), { failReason: 'foreign-host' })
    assert.deepEqual(await fetchClaimFile(`${BASE}/storage/v1/object/public/item-images/a.jpg`), { failReason: 'foreign-host' })
    assert.equal(downloadCalls.length, before)
  } finally {
    globalThis.fetch = realFetch
  }
  console.log('✓ fetchClaimFile ผ่าน storage.download')

  // ─── 4. static scan หน้าจอที่แก้ ─────────────────────────────────────────
  const VIEWS = [
    'app/(authenticated)/check-in/check-in-view.tsx',
    'app/(authenticated)/check-in/history/history-view.tsx',
    'app/(authenticated)/check-in/report/report-view.tsx',
    'app/(authenticated)/check-in/dashboard/leave-dashboard-view.tsx',
    'app/(authenticated)/check-in/leave-section.tsx',
    'app/(authenticated)/finance/[id]/claim-detail-view.tsx',
    'app/(authenticated)/finance/[id]/receipt-thumb.tsx',
    'app/(authenticated)/finance/queue-panel.tsx',
    'app/(authenticated)/crm/[id]/components/financial-card.tsx',
  ]
  const FIELD = /photo_url|checkout_photo_url|receipt_urls|refund_slip_urls|actual_receipt_urls|tax_invoice_urls|payment_proof|attachment_url|proofUrl|showPhotoLightbox|\burl\b/
  const offenders: string[] = []
  for (const rel of VIEWS) {
    const lines = readFileSync(join(__dirname, '..', rel), 'utf8').split('\n')
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/\b(src|href)=\{([^}]*)\}/g)) {
        if (FIELD.test(m[2]) && !m[2].includes('appFileUrl(') && !m[2].startsWith('`')) offenders.push(`${rel}:${i + 1} ${m[0]}`)
      }
    })
    assert.ok(lines.some(l => l.includes("from '@/lib/file-url'")), `${rel} ต้อง import appFileUrl`)
  }
  assert.deepEqual(offenders, [], `ยังมี URL ที่ไม่ผ่าน appFileUrl:\n${offenders.join('\n')}`)
  console.log('✓ static scan หน้าจอ', VIEWS.length, 'ไฟล์')

  // ─── 5. migration ─────────────────────────────────────────────────────────
  const sql = readFileSync(join(__dirname, '..', 'supabase/migrations/20261031_private_buckets.sql'), 'utf8')
  for (const b of PRIVATE_BUCKETS) assert.ok(sql.includes(`'${b}'`), b)
  assert.match(sql, /SET public = false/)
  console.log('✓ migration')

  console.log('file-url: ผ่านทั้งหมด')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
