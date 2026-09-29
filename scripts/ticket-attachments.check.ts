// ไฟล์แนบตั๋ว (บัคเก็ต ticket-attachments) — รัน uploadTicketAttachments / deleteTicketAttachment ตัวจริง
// กับฐานข้อมูล + สตอเรจจำลองในหน่วยความจำ แล้วตรวจไฟล์ในโปรเจกต์แบบ static อีกชุด
// Run:  npx tsx scripts/ticket-attachments.check.ts
//
// ไม่แตะฐานข้อมูลหรือสตอเรจจริง ไม่ต้องมี env: แทน next/headers, next/cache และ @/lib/supabase-server
// ด้วยตัวจำลอง (เทคนิคเดียวกับ scripts/purchasing-flow.check.ts) · ผู้ใช้ทั้งหมดสังเคราะห์
// ครอบคลุมข้อ (a)–(i): ไม่ได้ล็อกอิน, cookie ปลอม, โฟลเดอร์/นามสกุลจาก client, สิทธิ์ลบ, URL มั่ว,
// lib/notifications ไม่ใช่ endpoint และ migration ที่ปิด policy ของบัคเก็ต
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "ticket-attachments: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

process.env.SESSION_SECRET = 'ticket-attachments-check'

// ── ผู้ใช้ (สังเคราะห์) ────────────────────────────────────────────────────────
type Row = Record<string, unknown>
type Result = { data: unknown; error: { code: string; message: string } | null }

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), A = uid(2), B = uid(3), PENDING = uid(4)

const person = (id: string, role: string, is_approved = true): Row =>
  ({ id, role, is_approved, active_session_id: `sess-${id}`, department: 'สตาฟ', full_name: `ผู้ใช้ทดสอบ ${id.slice(-1)}`, nickname: null })

const db: Record<string, Row[]> = {
  profiles: [person(ADMIN, 'admin'), person(A, 'staff'), person(B, 'staff'), person(PENDING, 'staff', false)],
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

// ── ฐานข้อมูลจำลอง: เท่าที่ requireAuth ใช้ (select → eq → single) ────────────────
class Query implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = []
  private one = false
  constructor(private table: string) {}

  select() { return this }
  eq(c: string, v: unknown) { this.filters.push(r => r[c] === v); return this }
  single() { this.one = true; return this }

  private run(): Result {
    const hits = (db[this.table] ?? []).filter(r => this.filters.every(f => f(r)))
    if (!this.one) return { data: clone(hits), error: null }
    if (hits.length === 1) return { data: clone(hits[0]), error: null }
    return { data: null, error: { code: 'PGRST116', message: `expected one row, got ${hits.length}` } }
  }

  then<X = Result, Y = never>(
    onfulfilled?: ((value: Result) => X | PromiseLike<X>) | null,
    onrejected?: ((reason: unknown) => Y | PromiseLike<Y>) | null
  ): PromiseLike<X | Y> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected)
  }
}

// ── สตอเรจจำลอง ──────────────────────────────────────────────────────────────
const BUCKET = 'ticket-attachments'
const PUBLIC_BASE = 'https://fake.supabase.test/storage/v1/object/public'
const BUCKET_BASE = `${PUBLIC_BASE}/${BUCKET}/`

/** `${bucket}/${path}` → ไฟล์ */
const files = new Map<string, { contentType: string; size: number }>()
const storageOps: { op: 'upload' | 'remove'; bucket: string; paths: string[] }[] = []
/** จำลองสตอเรจล่ม: คำสั่งถัดไปของชนิดนี้ได้ error */
const failNext = new Set<'upload' | 'remove'>()

const storage = {
  from(bucket: string) {
    return {
      async upload(path: string, body: Buffer, opts?: { contentType?: string; upsert?: boolean }) {
        storageOps.push({ op: 'upload' as const, bucket, paths: [path] })
        if (failNext.delete('upload')) return { data: null, error: { message: 'storage unavailable (จำลอง)' } }
        const key = `${bucket}/${path}`
        if (files.has(key) && !opts?.upsert) return { data: null, error: { message: 'The resource already exists' } }
        files.set(key, { contentType: opts?.contentType ?? '', size: body.length })
        return { data: { path }, error: null }
      },
      getPublicUrl(path: string) {
        // storage-js ตัวจริงครอบ URL ด้วย encodeURI
        return { data: { publicUrl: encodeURI(`${PUBLIC_BASE}/${bucket}/${path}`) } }
      },
      async remove(paths: string[]) {
        storageOps.push({ op: 'remove' as const, bucket, paths: [...paths] })
        if (failNext.delete('remove')) return { data: null, error: { message: 'storage unavailable (จำลอง)' } }
        for (const p of paths) files.delete(`${bucket}/${p}`)
        return { data: [], error: null }
      },
    }
  },
}
const fakeClient = { from: (table: string) => new Query(table), storage }

// ── แทนโมดูลที่ต้องมี Next/ฐานข้อมูลจริง ─────────────────────────────────────
const cookieJar = new Map<string, string>()
const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, {
    createServiceClient: () => fakeClient,
    removeStorageByUrls: async () => assert.fail('removeStorageByUrls ไม่ควรถูกเรียกในสคริปต์นี้'),
  }],
  [/^next\/headers$/, {
    cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
    headers: async () => ({ get: () => null }),
  }],
  [/^next\/cache$/, { revalidatePath() {}, revalidateTag() {} }],
]
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  return hit ? hit[1] : realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createSessionToken } = require('../lib/session') as typeof import('../lib/session')
const { uploadTicketAttachments, deleteTicketAttachment } =
  require('../app/(authenticated)/jobs/actions') as typeof import('../app/(authenticated)/jobs/actions')
/* eslint-enable @typescript-eslint/no-require-imports */

// ── ตัวช่วย ────────────────────────────────────────────────────────────────
/** ล็อกอินด้วย session_token ที่เซ็นถูกต้อง (+ cookie อื่นที่อยากยัดเพิ่ม เช่น cookie ปลอม) */
function loginAs(userId: string, extra: Record<string, string> = {}) {
  cookieJar.clear()
  cookieJar.set('session_token', createSessionToken(userId))
  cookieJar.set('session_id', `sess-${userId}`)
  for (const [k, v] of Object.entries(extra)) cookieJar.set(k, v)
}
function logout() {
  cookieJar.clear()
}

const MB = 1024 * 1024
const fileOf = (name = 'photo.png', size = 128, type = 'image/png') => new File([new Uint8Array(size)], name, { type })
function form(list: (File | string)[], folder?: string) {
  const fd = new FormData()
  for (const f of list) fd.append('files', f)
  if (folder !== undefined) fd.set('folder', folder)
  return fd
}

/** public URL → path ในบัคเก็ต */
function pathOf(url: string) {
  assert.ok(url.startsWith(BUCKET_BASE), `URL ต้องอยู่ในบัคเก็ต ${BUCKET}: ${url}`)
  return decodeURI(url.slice(BUCKET_BASE.length))
}
const stored = (path: string) => files.has(`${BUCKET}/${path}`)
/** ภาพรวมสตอเรจ — เทียบก่อน/หลังเพื่อพิสูจน์ว่าไม่มีการอัปโหลดหรือลบ */
const snapshot = () => JSON.stringify({ files: [...files.keys()].sort(), ops: storageOps.length })
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** อัปโหลดหนึ่งไฟล์ในนามผู้ใช้ที่ล็อกอินอยู่ ต้องสำเร็จ → path ในบัคเก็ต */
async function uploadOne(folder?: string, file: File = fileOf()): Promise<string> {
  const res = await uploadTicketAttachments(form([file], folder))
  assert.ok(res.success, `อัปโหลดต้องสำเร็จ แต่ได้ ${JSON.stringify(res)}`)
  assert.equal(res.urls.length, 1)
  assert.equal(res.errors, undefined)
  const path = pathOf(res.urls[0])
  assert.ok(stored(path), `ต้องมีไฟล์ ${path} ในสตอเรจ`)
  return path
}

/** ดัก console.error ระหว่าง run — คืนผลลัพธ์ + ข้อความที่ถูก log */
async function captureErrors<T>(run: () => Promise<T>): Promise<{ result: T; logged: string[] }> {
  const original = console.error
  const logged: string[] = []
  console.error = (...args: unknown[]) => { logged.push(args.map(String).join(' ')) }
  try {
    return { result: await run(), logged }
  } finally {
    console.error = original
  }
}

/** ไล่ไฟล์โค้ดทั้งหมดใต้โฟลเดอร์ (ข้าม node_modules และโฟลเดอร์ที่ขึ้นต้นด้วยจุด) */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return []
    const full = join(dir, e.name)
    if (e.isDirectory()) return walk(full)
    return /\.(?:tsx?|jsx?|mjs|cjs)$/.test(e.name) ? [full] : []
  })
}
/** คำสั่งแรกของไฟล์ (ข้าม BOM คอมเมนต์ และบรรทัดว่าง) */
const firstStatement = (src: string) =>
  src.replace(/^﻿/, '').replace(/^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/, '').split(/\r?\n/)[0].trim()
const hasDirective = (src: string, name: 'use server' | 'use client') =>
  new RegExp(`^['"]${name}['"]\\s*;?\\s*(?://.*)?$`).test(firstStatement(src))

const pass = (label: string) => console.log(`PASS  ${label}`)

const NOT_SIGNED_IN = 'ไม่ได้เข้าสู่ระบบ'
const NO_FILES = 'ไม่มีไฟล์ที่จะอัปโหลด'
const NOT_OWNER = 'ลบได้เฉพาะไฟล์ที่คุณอัปโหลดเอง'
const BAD_URL = 'ลิงก์ไฟล์ไม่ถูกต้อง'
const TICKET_ID = uid(500), EVAL_ID = uid(600)

async function main() {
  // ── (a) ไม่ได้ล็อกอิน → ทั้งสอง action ปฏิเสธ ไม่มีอะไรถูกอัปโหลดหรือลบ ──────────────
  const seedPath = `tickets/u-${A}/1700000000001_seed01.png`
  files.set(`${BUCKET}/${seedPath}`, { contentType: 'image/png', size: 1 })
  const untouched = snapshot()
  const anonymous: [string, () => void][] = [
    ['ไม่มี cookie', () => logout()],
    // ก่อนแก้: cookie session_user_id อย่างเดียวก็ผ่าน (ใครก็พิมพ์ id คนอื่นใส่เองได้)
    ['มีแค่ session_user_id ปลอม + session_role=admin', () => {
      logout()
      cookieJar.set('session_user_id', A)
      cookieJar.set('session_role', 'admin')
      cookieJar.set('session_id', `sess-${A}`)
    }],
    ['token ลายเซ็นปลอม', () => {
      logout()
      cookieJar.set('session_token', `${A}:${Date.now()}:${'0'.repeat(64)}`)
      cookieJar.set('session_id', `sess-${A}`)
    }],
    ['ผู้ใช้ยังไม่อนุมัติ', () => loginAs(PENDING)],
    ['ถูกเตะเพราะล็อกอินที่อื่น', () => { loginAs(A); cookieJar.set('session_id', 'sess-elsewhere') }],
  ]
  for (const [label, setup] of anonymous) {
    setup()
    assert.deepEqual(await uploadTicketAttachments(form([fileOf()], 'tickets')), { error: NOT_SIGNED_IN, urls: [] }, label)
    assert.deepEqual(await deleteTicketAttachment(BUCKET_BASE + seedPath), { error: NOT_SIGNED_IN }, label)
  }
  assert.equal(snapshot(), untouched, 'ไม่ได้ล็อกอินต้องไม่มีการอัปโหลดหรือลบใดๆ')
  pass('(a) ไม่ได้ล็อกอิน (ไม่มี cookie / มีแค่ session_user_id ปลอม / token ปลอม / ยังไม่อนุมัติ / ล็อกอินที่อื่น) — อัปโหลดและลบถูกปฏิเสธ สตอเรจไม่ถูกแตะ')

  // ── (b) token ถูกต้องของ A + cookie session_user_id ปลอมเป็น B → ตัวตนคือ A เสมอ ──────
  loginAs(B)
  const bPath = await uploadOne('tickets')
  loginAs(A, { session_user_id: B, session_role: 'admin' })
  const forged = await uploadTicketAttachments(form([fileOf()], 'tickets'))
  assert.ok(forged.success, JSON.stringify(forged))
  const forgedPath = pathOf(forged.urls[0])
  assert.ok(forgedPath.includes(`/u-${A}/`), `path ต้องเป็นของ A: ${forgedPath}`)
  assert.ok(!forged.urls[0].includes(B), `path ต้องไม่มี id ของ B: ${forged.urls[0]}`)
  // cookie ปลอม (session_user_id=B, session_role=admin) ก็ลบไฟล์ของ B ไม่ได้
  const beforeForgedDelete = snapshot()
  assert.deepEqual(await deleteTicketAttachment(BUCKET_BASE + bPath), { error: NOT_OWNER })
  assert.ok(stored(bPath))
  assert.equal(snapshot(), beforeForgedDelete)
  pass('(b) token ของ A + cookie session_user_id=B / session_role=admin ปลอม — อัปโหลดลง u-A ไม่มี id ของ B และลบไฟล์ของ B ไม่ได้')

  // ── (c) กติกาโฟลเดอร์ ────────────────────────────────────────────────────────
  loginAs(A)
  const kept = ['tickets', TICKET_ID, `kpi_evaluations/${EVAL_ID}`, 'y'.repeat(64)]
  for (const folder of kept) {
    const path = await uploadOne(folder)
    assert.match(path, new RegExp(`^${escapeRe(folder)}/u-${escapeRe(A)}/\\d+_[a-z0-9]+\\.png$`), `โฟลเดอร์ ${folder} ต้องคงเดิม`)
  }
  const toGeneral: (string | undefined)[] = ['../x', '/abs', 'a/b/c', 'a\\b', '', 'x'.repeat(65), 'tickets/', 'tickets/..', undefined]
  for (const folder of toGeneral) {
    const path = await uploadOne(folder)
    assert.match(path, new RegExp(`^general/u-${escapeRe(A)}/\\d+_[a-z0-9]+\\.png$`), `โฟลเดอร์ ${JSON.stringify(folder)} ต้องกลายเป็น general`)
  }
  pass(`(c) โฟลเดอร์ — 'tickets', uuid ตั๋ว, 'kpi_evaluations/<uuid>', ท่อนยาว 64 ตัว คงเดิม · '../x', '/abs', 'a/b/c', 'a\\b', '', ท่อนยาว 65 ตัว, 'tickets/', 'tickets/..', ไม่ส่งมา → general`)

  // ── (d) ประเภท/ขนาด/จำนวนไฟล์ ─────────────────────────────────────────────────
  // ชื่อ evil.html แต่ประเภท image/png → เก็บเป็น .png (นามสกุลมาจากประเภทไฟล์ ไม่ใช่ชื่อไฟล์)
  const evilPath = await uploadOne('tickets', fileOf('evil.html'))
  assert.match(evilPath, /^tickets\/u-[^/]+\/\d+_[a-z0-9]+\.png$/)
  assert.ok(!/evil|html/i.test(evilPath), evilPath)
  assert.equal(files.get(`${BUCKET}/${evilPath}`)?.contentType, 'image/png')
  const byMime: [string, string][] = [
    ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/gif', 'gif'], ['image/webp', 'webp'], ['application/pdf', 'pdf'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
    ['application/zip', 'zip'], ['application/x-rar-compressed', 'rar'], ['application/x-7z-compressed', '7z'],
  ]
  for (const [type, ext] of byMime) {
    const path = await uploadOne('tickets', fileOf('payload.exe', 16, type))
    assert.ok(path.endsWith(`.${ext}`), `${type} → .${ext} (ได้ ${path})`)
  }
  const refused: [string, File][] = [
    ['text/html', fileOf('evil.html', 64, 'text/html')],
    ['ไม่มีประเภทไฟล์', fileOf('x.png', 64, '')],
    ['ประเภทชื่อเดียวกับ key ของ prototype', fileOf('x.png', 64, 'constructor')],
    ['ไฟล์ว่าง', fileOf('empty.png', 0)],
    ['เกิน 50MB', fileOf('big.png', 50 * MB + 1)],
  ]
  for (const [label, file] of refused) {
    const before = snapshot()
    const res = await uploadTicketAttachments(form([file], 'tickets'))
    assert.ok(res.error, `${label}: ต้องถูกปฏิเสธ แต่ได้ ${JSON.stringify(res)}`)
    assert.deepEqual(res.urls, [])
    assert.match(res.error, /[฀-๿]/, `${label}: ข้อความถึงผู้ใช้ต้องเป็นภาษาไทย`)
    assert.equal(snapshot(), before, `${label}: ต้องไม่มีอะไรถูกอัปโหลด`)
  }
  // 11 ไฟล์ในครั้งเดียว → ปฏิเสธทั้งชุด ไม่อัปโหลดสักไฟล์ · 10 ไฟล์พอดี → ผ่านครบ
  const eleven = Array.from({ length: 11 }, (_, i) => fileOf(`p${i}.png`))
  const beforeEleven = snapshot()
  const resEleven = await uploadTicketAttachments(form(eleven, 'tickets'))
  assert.deepEqual(resEleven, { error: 'อัปโหลดได้ครั้งละไม่เกิน 10 ไฟล์', urls: [] })
  assert.equal(snapshot(), beforeEleven, '11 ไฟล์ต้องไม่ถูกอัปโหลดเลย')
  const resTen = await uploadTicketAttachments(form(eleven.slice(0, 10), 'tickets'))
  assert.equal(resTen.success, true)
  assert.equal(resTen.urls.length, 10)
  // ดีปนเสีย → คืนไฟล์ที่ผ่าน + errors (รูปแบบที่ FileUploadZone ใช้)
  const mixed = await uploadTicketAttachments(form([fileOf('good.png'), fileOf('bad.html', 8, 'text/html')], 'tickets'))
  assert.equal(mixed.success, true)
  assert.equal(mixed.urls.length, 1)
  assert.deepEqual(mixed.errors, ['bad.html: ไม่รองรับประเภทไฟล์นี้'])
  // รายการที่ไม่ใช่ไฟล์ถูกข้าม · อาร์กิวเมนต์ที่ไม่ใช่ FormData ไม่ throw
  const withText = await uploadTicketAttachments(form(['not-a-file', fileOf()], 'tickets'))
  assert.equal(withText.urls.length, 1)
  for (const junk of [form(['only-text'], 'tickets'), new FormData(), null, undefined, 'files', 42, {}]) {
    const before = snapshot()
    assert.deepEqual(await uploadTicketAttachments(junk as unknown as FormData), { error: NO_FILES, urls: [] }, String(junk))
    assert.equal(snapshot(), before)
  }
  // สตอเรจพัง → ข้อความไทยถึงผู้ใช้ ข้อความดิบไป console.error
  failNext.add('upload')
  const upFail = await captureErrors(() => uploadTicketAttachments(form([fileOf('down.png')], 'tickets')))
  assert.deepEqual(upFail.result, { error: 'down.png: อัปโหลดไม่สำเร็จ', urls: [] })
  assert.ok(upFail.logged.some(l => l.includes('storage unavailable')), 'ข้อความดิบต้องไปที่ console.error')
  pass('(d) evil.html (image/png) เก็บเป็น .png · นามสกุลตามประเภทครบ 10 แบบ · text/html / ไม่มีประเภท / ไฟล์ว่าง / เกิน 50MB / 11 ไฟล์ ถูกปฏิเสธโดยไม่อัปโหลดอะไร · 10 ไฟล์ผ่าน · อาร์กิวเมนต์มั่วไม่ throw · สตอเรจพังได้ข้อความไทย')

  // ── (e) A ลบไฟล์ที่ A อัปโหลดเอง ─────────────────────────────────────────────────
  loginAs(A)
  const ownPath = await uploadOne('tickets')
  const opsBefore = storageOps.length
  assert.deepEqual(await deleteTicketAttachment(BUCKET_BASE + ownPath), { success: true })
  assert.ok(!stored(ownPath))
  assert.deepEqual(storageOps.slice(opsBefore), [{ op: 'remove', bucket: BUCKET, paths: [ownPath] }])
  // โฟลเดอร์สองท่อน + URL ที่มี ?query / #hash ต่อท้าย
  const evalPath = await uploadOne(`kpi_evaluations/${EVAL_ID}`)
  assert.deepEqual(await deleteTicketAttachment(`${BUCKET_BASE}${evalPath}?download=1#top`), { success: true })
  assert.ok(!stored(evalPath))
  // สตอเรจลบไม่สำเร็จ → ข้อความไทย ข้อความดิบไป console.error
  const stuckPath = await uploadOne('tickets')
  failNext.add('remove')
  const delFail = await captureErrors(() => deleteTicketAttachment(BUCKET_BASE + stuckPath))
  assert.deepEqual(delFail.result, { error: 'ลบไฟล์ไม่สำเร็จ กรุณาลองใหม่' })
  assert.ok(delFail.logged.some(l => l.includes('storage unavailable')), 'ข้อความดิบต้องไปที่ console.error')
  pass('(e) A ลบไฟล์ของตัวเองได้ (โฟลเดอร์ 1 และ 2 ท่อน, URL มี ?query#hash) — ลบตรง path เดียว · สตอเรจพังได้ข้อความไทย')

  // ── (f) B ลบไฟล์ของ A ไม่ได้ ─────────────────────────────────────────────────────
  loginAs(A)
  const aPath = await uploadOne('tickets')
  loginAs(B)
  const beforeF = snapshot()
  assert.deepEqual(await deleteTicketAttachment(BUCKET_BASE + aPath), { error: NOT_OWNER })
  // อ้อมผ่านโฟลเดอร์ของตัวเองแล้วถอยออกด้วย .. ก็ไม่ได้
  assert.deepEqual(await deleteTicketAttachment(`${BUCKET_BASE}tickets/u-${B}/../../${aPath}`), { error: BAD_URL })
  assert.ok(stored(aPath))
  assert.equal(snapshot(), beforeF)
  pass(`(f) B ลบไฟล์ของ A → "${NOT_OWNER}" ไฟล์ยังอยู่ ไม่มีคำสั่งลบถึงสตอเรจ`)

  // ── (g) ไฟล์ยุคก่อน (ไม่มีท่อน u-<id>) → admin เท่านั้นที่ลบได้ ─────────────────────────
  const legacy = 'tickets/1700000000000_abc123.png'
  files.set(`${BUCKET}/${legacy}`, { contentType: 'image/png', size: 1 })
  loginAs(A)
  assert.deepEqual(await deleteTicketAttachment(BUCKET_BASE + legacy), { error: NOT_OWNER })
  assert.ok(stored(legacy))
  loginAs(ADMIN)
  assert.deepEqual(await deleteTicketAttachment(BUCKET_BASE + legacy), { success: true })
  assert.ok(!stored(legacy))
  // admin ลบไฟล์แบบใหม่ของคนอื่นได้ด้วย
  assert.deepEqual(await deleteTicketAttachment(BUCKET_BASE + aPath), { success: true })
  assert.ok(!stored(aPath))
  pass('(g) ไฟล์เก่า tickets/1700000000000_abc123.png — ผู้ใช้ทั่วไปลบไม่ได้ ไฟล์ยังอยู่ · admin ลบได้ (รวมไฟล์ใหม่ของคนอื่น)')

  // ── (h) URL ที่ต้องถูกปฏิเสธสำหรับทุกคน รวม admin ─────────────────────────────────
  loginAs(A)
  const target = await uploadOne('tickets')
  files.set(`receipts/${target}`, { contentType: 'image/png', size: 1 })
  const badUrls: [string, unknown][] = [
    ['บัคเก็ตอื่น', `${PUBLIC_BASE}/receipts/${target}`],
    ['.. ตรงๆ', `${BUCKET_BASE}tickets/../../receipts/${target}`],
    ['%2e%2e', `${BUCKET_BASE}tickets/%2e%2e/%2E%2E/receipts/${target}`],
    ['backslash', `${BUCKET_BASE}${target.replace(/\//g, '\\')}`],
    ['backslash แบบ %5C', `${BUCKET_BASE}tickets%5C${target}`],
    ['%xx พัง', `${BUCKET_BASE}tickets/%E0%A4%A.png`],
    ['สตริงว่าง', ''],
    ['ตัวเลข', 42],
    ['null', null],
    ['undefined', undefined],
    ['object', { url: BUCKET_BASE + target }],
    ['รากบัคเก็ต', BUCKET_BASE],
    ['เหลือแต่ query', `${BUCKET_BASE}?path=${target}`],
    ['/ นำหน้า', `${BUCKET_BASE}/${target}`],
    ['// กลาง path', `${BUCKET_BASE}${target.replace('/u-', '//u-')}`],
  ]
  for (const who of [ADMIN, A]) {
    loginAs(who)
    for (const [label, url] of badUrls) {
      const before = snapshot()
      assert.deepEqual(await deleteTicketAttachment(url as string), { error: BAD_URL }, `${label} (${who === ADMIN ? 'admin' : 'เจ้าของไฟล์'})`)
      assert.equal(snapshot(), before, `${label}: ต้องไม่มีคำสั่งลบถึงสตอเรจ`)
    }
  }
  assert.ok(stored(target) && files.has(`receipts/${target}`))
  pass(`(h) URL มั่ว ${badUrls.length} แบบ (บัคเก็ตอื่น, .., %2e%2e, backslash, %xx พัง, สตริงว่าง, ตัวเลข ฯลฯ) — ปฏิเสธทั้ง admin และเจ้าของไฟล์ ไม่ throw ไม่ลบอะไร`)

  // ── (i) ตรวจไฟล์แบบ static ───────────────────────────────────────────────────
  const ROOT = join(__dirname, '..')
  const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

  const notifications = read('lib/notifications.ts')
  assert.ok(!hasDirective(notifications, 'use server'), 'lib/notifications.ts ต้องไม่ขึ้นต้นด้วย directive use server')
  assert.doesNotMatch(notifications, /^\s*['"]use server['"]\s*;?\s*$/m, 'lib/notifications.ts ต้องไม่มี directive use server บรรทัดไหนเลย')
  for (const exp of ['export async function createNotifications(', 'export type NotificationType', 'export type ReferenceType']) {
    assert.ok(notifications.includes(exp), `lib/notifications.ts ต้องยัง export ${exp}`)
  }

  const IMPORTS_NOTIFICATIONS = /(?:from|import)\s*\(?\s*['"][^'"]*lib\/notifications['"]/
  const clientFiles = ['app', 'components'].flatMap(d => walk(join(ROOT, d))).filter(f => hasDirective(readFileSync(f, 'utf8'), 'use client'))
  assert.ok(clientFiles.length > 0, 'ต้องเจอ client component อย่างน้อยหนึ่งไฟล์ (ไม่งั้นตัวตรวจพัง)')
  for (const f of clientFiles) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), IMPORTS_NOTIFICATIONS, `${relative(ROOT, f)}: client component ห้าม import lib/notifications`)
  }
  const importers = ['app', 'components', 'lib', 'contexts', 'hooks'].flatMap(d => walk(join(ROOT, d)))
    .filter(f => IMPORTS_NOTIFICATIONS.test(readFileSync(f, 'utf8')))
  assert.ok(importers.length > 0, 'ต้องเจอไฟล์ที่ import lib/notifications อย่างน้อยหนึ่งไฟล์')
  for (const f of importers) {
    assert.ok(hasDirective(readFileSync(f, 'utf8'), 'use server'), `${relative(ROOT, f)}: ไฟล์ที่ import lib/notifications ต้องขึ้นต้นด้วย 'use server'`)
  }

  const migration = read('supabase/migrations/20260929_ticket_attachments_lockdown.sql')
  assert.match(migration, /DROP POLICY IF EXISTS ticket_attachments_all ON storage\.objects/)
  assert.doesNotMatch(migration, /create\s+policy/i, 'migration ต้องไม่สร้าง policy ใหม่')
  assert.doesNotMatch(migration, /\bgrant\b/i, 'migration ต้องไม่ GRANT อะไร')

  // สองฟังก์ชันไฟล์แนบ: requireAuth() มาก่อนแตะสตอเรจ และไม่อ่าน cookie แบบไม่เซ็นอีก
  const jobs = read('app/(authenticated)/jobs/actions.ts')
  const up = jobs.indexOf('export async function uploadTicketAttachments(')
  const del = jobs.indexOf('export async function deleteTicketAttachment(')
  const end = jobs.indexOf('// Ticket Reactions', del)
  assert.ok(up > 0 && del > up && end > del, 'หาฟังก์ชันไฟล์แนบใน jobs/actions.ts ไม่เจอ')
  for (const [name, body] of [['uploadTicketAttachments', jobs.slice(up, del)], ['deleteTicketAttachment', jobs.slice(del, end)]]) {
    const auth = body.indexOf('await requireAuth()')
    assert.ok(auth > 0 && auth < body.indexOf('.storage'), `${name}: ต้องเรียก requireAuth() ก่อนแตะสตอเรจ`)
    assert.ok(!/getSession\(|cookies\(|session_user_id/.test(body), `${name}: ห้ามอ่าน cookie แบบไม่เซ็น`)
  }
  pass(`(i) static — lib/notifications.ts ไม่มี use server และ export ครบ · client component ${clientFiles.length} ไฟล์ไม่มีตัวไหน import มัน · ${importers.length} ไฟล์ที่ import ขึ้นต้นด้วย use server ทุกไฟล์ · migration มีแค่ DROP POLICY IF EXISTS · สองฟังก์ชันไฟล์แนบเรียก requireAuth() ก่อนแตะสตอเรจ`)

  console.log('\nticket-attachments: ผ่านทั้งหมด')
}

main().catch(e => {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
})
