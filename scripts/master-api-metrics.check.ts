// M1 (endpoint schema/migration ของ master ต้องมี x-master-token) + M2 (SSRF ใน content-planner/metrics-lib)
// Run:  npx tsx scripts/master-api-metrics.check.ts
//
// ไม่แตะฐานข้อมูลหรือเครือข่ายจริง: schema-introspect / supabase-server ถูกแทน, globalThis.fetch เป็นตัวจำลองที่จดทุกครั้งที่ถูกเรียก
// route migrations/list และ migrations/[filename] อ่านไฟล์จริงใน supabase/migrations (อ่านอย่างเดียว)
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "master-api-metrics: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'

const env = process.env as Record<string, string | undefined>

// ── แทนโมดูลที่ต้องมีฐานข้อมูล ──────────────────────────────────────────────────
const fakeSchema = { columns: [{ table: 't', column: 'id' }], indexes: [], triggers: [], functions: [] }
const fakeClient = {
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: 'META-TOKEN' }, error: null }) }) }),
  }),
}
const mocks: [RegExp, unknown][] = [
  [/schema-introspect$/, { readPublicSchema: async () => fakeSchema, computeFingerprint: () => 'fp-123' }],
  [/supabase-server$/, { createServiceClient: () => fakeClient }],
]
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  return hit ? hit[1] : realLoad.call(this, request, ...rest)
}

// ── fetch จำลอง ────────────────────────────────────────────────────────────────
const calls: string[] = []
const NO_FETCH = (): Response => { throw new Error('fetch ไม่ควรถูกเรียก') }
let responder: (url: string) => Response = NO_FETCH
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  calls.push(url)
  return responder(url)
}) as typeof fetch

const load = createRequire(__filename)
const fingerprint = load('../app/api/schema/fingerprint/route') as typeof import('../app/api/schema/fingerprint/route')
const list = load('../app/api/migrations/list/route') as typeof import('../app/api/migrations/list/route')
const full = load('../app/api/schema/full/route') as typeof import('../app/api/schema/full/route')
const migFile = load('../app/api/migrations/[filename]/route') as typeof import('../app/api/migrations/[filename]/route')
const metrics = load('../app/(authenticated)/content-planner/metrics-lib') as typeof import('../app/(authenticated)/content-planner/metrics-lib')

let n = 0
function ok(name: string) { n++; console.log(`  ✓ ${name}`) }

const TOKEN = 'correct-horse-battery'

async function main() {
  // ── AC2.7 / M1 ───────────────────────────────────────────────────────────────
  const req = (path: string, token?: string) =>
    new Request(`http://localhost${path}`, token === undefined ? {} : { headers: { 'x-master-token': token } })
  const routes: [string, (r: Request) => Promise<Response>][] = [
    ['/api/schema/fingerprint', r => fingerprint.GET(r)],
    ['/api/migrations/list', r => list.GET(r)],
    ['/api/schema/full', r => full.GET(r)],
    ['/api/migrations/[filename]', r => migFile.GET(r, { params: Promise.resolve({ filename: '20261007_consumables.sql' }) })],
  ]

  delete env.MASTER_API_TOKEN
  for (const [p, h] of routes) {
    assert.equal((await h(req(p))).status, 403, `${p} ไม่ตั้ง env ไม่มี header`)
    assert.equal((await h(req(p, ''))).status, 403, `${p} ไม่ตั้ง env header ว่าง`)
    assert.equal((await h(req(p, TOKEN))).status, 403, `${p} ไม่ตั้ง env มี header`)
  }
  env.MASTER_API_TOKEN = ''
  for (const [p, h] of routes) assert.equal((await h(req(p, ''))).status, 403, `${p} env ว่าง`)
  ok('ไม่ตั้ง MASTER_API_TOKEN (หรือว่าง) → 403 ทุก route แม้ส่ง header')

  env.MASTER_API_TOKEN = TOKEN
  for (const [p, h] of routes) {
    assert.equal((await h(req(p))).status, 403, `${p} ไม่มี header`)
    assert.equal((await h(req(p, 'wrong'))).status, 403, `${p} header ผิด`)
    assert.equal((await h(req(p, `${TOKEN}-x`))).status, 403, `${p} header ยาวกว่า`)
  }
  ok('ตั้ง env แล้ว header ผิด/ไม่มี → 403')

  for (const [p, h] of routes) assert.equal((await h(req(p, TOKEN))).status, 200, `${p} header ถูก`)
  const fpJson = await (await fingerprint.GET(req('/api/schema/fingerprint', TOKEN))).json()
  assert.equal(fpJson.fingerprint, 'fp-123')
  const listJson = await (await list.GET(req('/api/migrations/list', TOKEN))).json()
  assert.ok(listJson.count > 0 && Array.isArray(listJson.items))
  ok('header ถูก → 200 (fingerprint + manifest จากไฟล์จริง)')

  // ── M2: SSRF ─────────────────────────────────────────────────────────────────
  calls.length = 0
  responder = NO_FETCH
  for (const [platform, url] of [
    ['tiktok', 'https://169.254.169.254/x'],
    ['tiktok', 'http://www.tiktok.com/x'],
    ['facebook', 'https://evil.example/p'],
    ['tiktok', 'https://www.tiktok.com.evil.example/x'],
    ['instagram', 'https://instagram.com.evil.example/p/1'],
    ['facebook', 'http://www.facebook.com/x/posts/1'],
    ['tiktok', 'not a url'],
  ]) {
    const r = await metrics.fetchMetricsForUrl(platform, url)
    assert.ok(r.error && !r.metrics, `${url} ต้อง error`)
  }
  assert.equal(calls.length, 0, 'ต้องไม่มีการ fetch เลย')
  assert.ok((await metrics.fetchTikTokMetrics('https://10.0.0.1/x')).error)
  assert.ok((await metrics.fetchMetaMetrics('https://127.0.0.1/x')).error)
  assert.equal(calls.length, 0, 'เรียกฟังก์ชันย่อยตรงก็ต้องไม่ fetch')
  ok('URL นอกรายชื่อ / ไม่ใช่ https → error โดยไม่ fetch')

  const stats = { playCount: 1500, diggCount: 120, commentCount: 7, shareCount: 3, collectCount: 9 }
  const page = (body: string) =>
    `<html><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${body}</script></body></html>`
  const html = page(JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: { stats } } } } }))

  calls.length = 0
  responder = () => new Response(html, { status: 200 })
  const good = await metrics.fetchMetricsForUrl('tiktok', 'https://www.tiktok.com/@a/video/1')
  assert.deepEqual(good, { metrics: { views: 1500, likes: 120, comments: 7, shares: 3, saves: 9 } })
  assert.equal(calls.length, 1)
  ok('TikTok ลิงก์ถูก → อ่านยอดได้')

  // redirect ภายใน tiktok ตามได้ (vm.tiktok.com → www.tiktok.com)
  calls.length = 0
  responder = url => url.startsWith('https://vm.tiktok.com/')
    ? new Response(null, { status: 302, headers: { location: 'https://www.tiktok.com/@a/video/1' } })
    : new Response(html, { status: 200 })
  assert.ok((await metrics.fetchMetricsForUrl('tiktok', 'https://vm.tiktok.com/abc')).metrics)
  assert.equal(calls.length, 2)
  ok('redirect ไป host tiktok → ตามได้')

  calls.length = 0
  responder = () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } })
  const redir = await metrics.fetchMetricsForUrl('tiktok', 'https://www.tiktok.com/@a/video/1')
  assert.ok(redir.error && !redir.metrics)
  assert.equal(calls.length, 1, 'ห้ามตาม redirect ออกนอก tiktok')
  ok('302 → evil.example → error และไม่ fetch ครั้งที่สอง')

  calls.length = 0
  responder = () => new Response(null, { status: 301, headers: { location: 'https://www.tiktok.com/loop' } })
  assert.ok((await metrics.fetchMetricsForUrl('tiktok', 'https://www.tiktok.com/@a/video/1')).error)
  assert.equal(calls.length, 3, 'ตาม redirect ได้ไม่เกิน 2 ครั้ง')
  ok('redirect วนใน tiktok → หยุดที่ 2 hop')

  calls.length = 0
  const big = page(JSON.stringify({ stats, pad: 'x'.repeat(2 * 1024 * 1024) }))
  responder = () => new Response(big, { status: 200 })
  const tooBig = await metrics.fetchMetricsForUrl('tiktok', 'https://www.tiktok.com/@a/video/1')
  assert.ok(tooBig.error && !tooBig.metrics)
  ok('body เกิน 2MB → error')

  // Meta: ลิงก์ถูก → ยิงไป graph.facebook.com เท่านั้น
  calls.length = 0
  responder = url => url.includes('/insights')
    ? Response.json({ data: [{ values: [{ value: 400 }] }] })
    : Response.json({ id: '1_2', reactions: { summary: { total_count: 10 } }, comments: { summary: { total_count: 2 } }, shares: { count: 1 } })
  const meta = await metrics.fetchMetricsForUrl('facebook', 'https://www.facebook.com/page/posts/123456')
  assert.deepEqual(meta, { metrics: { likes: 10, comments: 2, shares: 1, reach: 400 } })
  assert.ok(calls.length === 2 && calls.every(u => u.startsWith('https://graph.facebook.com/')))
  for (const u of ['https://fb.watch/abc', 'https://m.facebook.com/x', 'https://www.instagram.com/p/xyz/']) {
    calls.length = 0
    await metrics.fetchMetricsForUrl('facebook', u)
    assert.ok(calls.length >= 1 && calls.every(c => c.startsWith('https://graph.facebook.com/')), u)
  }
  ok('Facebook/Instagram ลิงก์ถูก → ยิงเฉพาะ graph.facebook.com')

  console.log(`master-api-metrics: ${n} ชุด`)
  console.log('master-api-metrics: ผ่านทั้งหมด')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
