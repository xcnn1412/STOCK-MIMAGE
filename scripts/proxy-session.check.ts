// ตัวตรวจการล็อกอินของทุกคำขอ (proxy.ts) — รัน proxy() ตัวจริงกับ Supabase จำลอง
// Run:  npx tsx scripts/proxy-session.check.ts
//
// ตรวจว่า: (1) อ่าน profiles ด้วยกุญแจฝั่ง server ไม่ใช่กุญแจสาธารณะ
//          (2) ประตูของหน้าแอดมินใช้บทบาทจากฐานข้อมูล ไม่ใช่ cookie session_role ที่ผู้ใช้แก้เองได้
//          (3) session ที่ใช้ไม่ได้ถูกส่งไปหน้าล็อกอิน
// ไม่แตะฐานข้อมูลหรือเครือข่ายจริง · ผู้ใช้สังเคราะห์
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "proxy-session: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'

process.env.SESSION_SECRET = 'proxy-session-check'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'PUBLIC-KEY'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'SERVER-KEY'

type Row = Record<string, unknown>
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), STAFF = uid(2), BLOCKED = uid(3), PENDING = uid(4)
const profiles: Row[] = [
  { id: ADMIN, role: 'admin', is_approved: true, is_blocked: false, active_session_id: 'sess-admin', allowed_modules: ['stock'] },
  { id: STAFF, role: 'staff', is_approved: true, is_blocked: false, active_session_id: 'sess-staff', allowed_modules: ['stock', 'finance', 'admin'] },
  { id: BLOCKED, role: 'staff', is_approved: true, is_blocked: true, active_session_id: 'sess-blocked', allowed_modules: ['stock'] },
  { id: PENDING, role: 'staff', is_approved: false, is_blocked: false, active_session_id: 'sess-pending', allowed_modules: ['stock'] },
]

const keysUsed: string[] = []
const fakeSupabase = {
  createClient(_url: string, key: string) {
    keysUsed.push(key)
    return {
      from(table: string) {
        assert.equal(table, 'profiles', 'proxy อ่านได้เฉพาะตาราง profiles')
        let id = ''
        const q = {
          select() { return q },
          eq(col: string, value: string) { assert.equal(col, 'id'); id = value; return q },
          async single() {
            // กุญแจสาธารณะ = ฐานข้อมูลที่ปิดสิทธิ์แล้วไม่ให้อ่าน
            if (key !== 'SERVER-KEY') return { data: null, error: { code: '42501', message: 'permission denied' } }
            const row = profiles.find(p => p.id === id)
            return row ? { data: { ...row }, error: null } : { data: null, error: { code: 'PGRST116', message: 'not found' } }
          },
        }
        return q
      },
    }
  },
}

type Loader = (request: string, parent: unknown, isMain: boolean) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (request, parent, isMain) {
  if (request === '@supabase/supabase-js') return fakeSupabase
  if (request === '@/lib/license' || request.endsWith('/lib/license')) {
    return { getLicenseStatus: () => ({ expired: false }), getExpiredRedirectUrl: () => 'https://example.invalid/expired' }
  }
  return realLoad.call(this, request, parent, isMain)
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NextRequest } = require('next/server') as typeof import('next/server')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createSessionToken } = require('../lib/session') as typeof import('../lib/session')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { proxy } = require('../proxy') as typeof import('../proxy')

function request(path: string, cookies: Record<string, string>) {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  return new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} })
}
const signed = (userId: string, sessionId: string, extra: Record<string, string> = {}) =>
  ({ session_token: createSessionToken(userId), session_id: sessionId, ...extra })

/** ผลของ proxy: 'next' = ปล่อยผ่าน, ไม่งั้นคือ path ที่ถูกส่งไป */
async function outcome(path: string, cookies: Record<string, string>): Promise<string> {
  const res = await proxy(request(path, cookies))
  const location = res.headers.get('location')
  return location ? new URL(location).pathname : 'next'
}
const pass = (label: string) => console.log(`PASS  ${label}`)

async function main() {
  // (1) กุญแจที่ใช้อ่าน profiles
  keysUsed.length = 0
  assert.equal(await outcome('/dashboard', signed(STAFF, 'sess-staff')), 'next')
  assert.deepEqual(keysUsed, ['SERVER-KEY'], 'ต้องอ่าน profiles ด้วยกุญแจฝั่ง server')
  assert.ok(!keysUsed.includes('PUBLIC-KEY'))
  pass('อ่าน profiles ด้วยกุญแจฝั่ง server เท่านั้น — ฐานข้อมูลที่ปิดสิทธิ์กุญแจสาธารณะแล้วยังล็อกอินได้')

  // (2) ประตูหน้าแอดมิน: บทบาทจากฐานข้อมูล
  // พนักงานคนนี้มี 'admin' ใน allowed_modules ด้วย (กรณีเลวร้ายสุด) และปลอม cookie session_role=admin
  for (const path of ['/users', '/logs', '/security', '/users/123']) {
    assert.equal(await outcome(path, signed(STAFF, 'sess-staff', { session_role: 'admin' })), '/dashboard', `พนักงานต้องเข้า ${path} ไม่ได้`)
  }
  pass('พนักงานที่ปลอม cookie session_role=admin เข้า /users /logs /security ไม่ได้')
  for (const path of ['/users', '/logs', '/security']) {
    // แอดมินจริง แม้ cookie session_role จะเป็น staff หรือไม่มีเลย
    assert.equal(await outcome(path, signed(ADMIN, 'sess-admin', { session_role: 'staff' })), 'next')
    assert.equal(await outcome(path, signed(ADMIN, 'sess-admin')), 'next')
  }
  pass('แอดมินเข้าได้โดยไม่ขึ้นกับ cookie session_role')

  // (3) session ที่ใช้ไม่ได้
  assert.equal(await outcome('/finance', {}), '/login')
  assert.equal(await outcome('/finance', signed(STAFF, 'sess-someone-else')), '/login', 'ล็อกอินที่อื่นแล้ว = session เดิมใช้ไม่ได้')
  assert.equal(await outcome('/finance', signed(BLOCKED, 'sess-blocked')), '/login', 'บัญชีที่ถูกระงับ')
  assert.equal(await outcome('/finance', signed(PENDING, 'sess-pending')), '/login', 'บัญชีที่ยังไม่อนุมัติ')
  assert.equal(await outcome('/finance', { session_token: `${ADMIN}:${Date.now()}:deadbeef`, session_id: 'sess-admin' }), '/login', 'token ลายเซ็นปลอม')
  assert.equal(await outcome('/finance', signed(uid(99), 'x')), '/login', 'ผู้ใช้ที่ไม่มีอยู่')
  pass('ไม่ล็อกอิน / ล็อกอินที่อื่น / ถูกระงับ / ยังไม่อนุมัติ / token ปลอม / ไม่มีผู้ใช้ → ไปหน้าล็อกอิน')

  // (4) สิทธิ์โมดูลยังทำงาน
  assert.equal(await outcome('/finance', signed(STAFF, 'sess-staff')), 'next')
  assert.equal(await outcome('/salary', signed(STAFF, 'sess-staff')), '/dashboard', 'พนักงานไม่มีโมดูลเงินเดือน')
  assert.equal(await outcome('/salary', signed(ADMIN, 'sess-admin')), 'next', 'แอดมินได้โมดูลเงินเดือนเสมอ')
  assert.equal(await outcome('/login', signed(STAFF, 'sess-staff')), '/dashboard', 'ล็อกอินแล้วเปิดหน้าล็อกอิน = ไปหน้าแรก')
  pass('สิทธิ์ตามโมดูลทำงานตามเดิม')

  console.log('\nproxy-session: ผ่านทั้งหมด')
}

main().catch(e => { console.error('FAIL ', e); process.exit(1) })
