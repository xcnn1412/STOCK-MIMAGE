// ตัวตรวจการล็อกอินของทุกคำขอ (proxy.ts) — รัน proxy() ตัวจริงกับ Supabase จำลอง
// Run:  npx tsx scripts/proxy-session.check.ts
//
// ตรวจว่า: (1) อ่าน profiles ด้วยกุญแจฝั่ง server ไม่ใช่กุญแจสาธารณะ
//          (2) ประตูของหน้าแอดมินใช้บทบาทจากฐานข้อมูล ไม่ใช่ cookie session_role ที่ผู้ใช้แก้เองได้
//          (3) session ที่ใช้ไม่ได้ถูกส่งไปหน้าล็อกอิน (รวม cookie แบบเก่าที่ไม่ได้เซ็น, active_session_id เป็น null,
//              ไม่มี session_id) และ cookie ของ session ถูกลบทุกครั้ง
//          (5) QR กระเป๋า /kits/<id>/check เข้าได้ด้วยสิทธิ์ stock หรือ events (ส่วนอื่นของ /kits ต้องมี stock)
//          (6) ตั้งค่าคลัง /stock/settings ต้องมีสิทธิ์ stock
//          (7) แพ็กเกจ /packages ต้องมีสิทธิ์ stock
//          (10) แดชบอร์ดการใช้งาน /stock/usage ต้องมีสิทธิ์ stock
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
const ADMIN = uid(1), STAFF = uid(2), BLOCKED = uid(3), PENDING = uid(4), LOGGED_OUT = uid(5)
const EVENTS_ONLY = uid(6), STOCK_ONLY = uid(7), NEITHER = uid(8)
const profiles: Row[] = [
  { id: ADMIN, role: 'admin', is_approved: true, is_blocked: false, active_session_id: 'sess-admin', allowed_modules: ['stock'] },
  { id: STAFF, role: 'staff', is_approved: true, is_blocked: false, active_session_id: 'sess-staff', allowed_modules: ['stock', 'finance', 'admin'] },
  { id: BLOCKED, role: 'staff', is_approved: true, is_blocked: true, active_session_id: 'sess-blocked', allowed_modules: ['stock'] },
  { id: PENDING, role: 'staff', is_approved: false, is_blocked: false, active_session_id: 'sess-pending', allowed_modules: ['stock'] },
  // แอดมินที่ออกจากระบบแล้ว (หรือถูกเตะออก) — active_session_id เป็น null
  { id: LOGGED_OUT, role: 'admin', is_approved: true, is_blocked: false, active_session_id: null, allowed_modules: ['stock'] },
  // สิทธิ์ QR กระเป๋า
  { id: EVENTS_ONLY, role: 'staff', is_approved: true, is_blocked: false, active_session_id: 'sess-ev', allowed_modules: ['events'] },
  { id: STOCK_ONLY, role: 'staff', is_approved: true, is_blocked: false, active_session_id: 'sess-st', allowed_modules: ['stock'] },
  { id: NEITHER, role: 'staff', is_approved: true, is_blocked: false, active_session_id: 'sess-no', allowed_modules: ['finance'] },
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

  // (3b) cookie แบบเก่า (ไม่ได้เซ็น) ไม่ใช่ตัวตนอีกต่อไป · active_session_id ต้องมีค่าและตรงกับ cookie
  assert.equal(await outcome('/dashboard', { session_user_id: ADMIN, session_role: 'admin', session_id: 'sess-admin' }), '/login', 'cookie แบบเก่าอย่างเดียว (แม้ session_id ตรง) → ไปหน้าล็อกอิน')
  assert.equal(await outcome('/dashboard', { session_user_id: LOGGED_OUT }), '/login', 'session_user_id ของคนที่ active_session_id เป็น null → ไปหน้าล็อกอิน')
  assert.equal(await outcome('/dashboard', signed(LOGGED_OUT, 'anything')), '/login', 'token ถูกต้องแต่ active_session_id เป็น null (ออกจากระบบแล้ว) → ไปหน้าล็อกอิน')
  assert.equal(await outcome('/dashboard', { session_token: createSessionToken(STAFF) }), '/login', 'token ถูกต้องแต่ไม่มี cookie session_id → ไปหน้าล็อกอิน')
  pass('cookie แบบเก่าอย่างเดียว / active_session_id เป็น null / ไม่มี session_id → ไปหน้าล็อกอิน')

  // token ของพนักงาน + cookie แบบเก่าปลอมเป็นแอดมิน → ตัวตนคือพนักงานเสมอ
  const forged = signed(STAFF, 'sess-staff', { session_user_id: ADMIN, session_role: 'admin' })
  assert.equal(await outcome('/users', forged), '/dashboard', 'พนักงาน + cookie แอดมินปลอม เข้า /users ไม่ได้')
  assert.equal(await outcome('/finance', forged), 'next', 'พนักงาน + cookie แอดมินปลอม ยังใช้โมดูลของตัวเองได้ตามปกติ')
  pass('token พนักงาน + session_user_id=แอดมิน + session_role=admin: /users → /dashboard · /finance ผ่าน (ตัวตน = พนักงาน)')

  // หน้าล็อกอินที่ถูกส่งไปต้องลบ cookie ของ session ทั้งสี่ตัวเสมอ (รวม cookie แบบเก่าที่ค้างอยู่)
  const toLogin: Record<string, string>[] = [{}, { session_user_id: ADMIN, session_role: 'admin', session_id: 'sess-admin' }, signed(LOGGED_OUT, 'anything')]
  for (const cookies of toLogin) {
    const res = await proxy(request('/dashboard', cookies))
    assert.equal(new URL(res.headers.get('location') ?? 'http://x/none').pathname, '/login')
    const setCookies = res.headers.getSetCookie()
    for (const name of ['session_token', 'session_user_id', 'session_role', 'session_id']) {
      const line = setCookies.find(c => c.startsWith(`${name}=`))
      assert.ok(line, `ต้องมี Set-Cookie ลบ ${name} (cookie ที่ส่งมา: ${Object.keys(cookies).join(',') || 'ไม่มี'})`)
      assert.match(line, /^[a-z_]+=;/, `${name} ต้องถูกตั้งเป็นค่าว่าง`)
      assert.match(line, /Expires=Thu, 01 Jan 1970|Max-Age=0/i, `${name} ต้องหมดอายุทันที`)
    }
  }
  pass('ถูกส่งไปหน้าล็อกอิน → Set-Cookie ลบ session_token / session_user_id / session_role / session_id ทุกครั้ง')

  // (4) สิทธิ์โมดูลยังทำงาน
  assert.equal(await outcome('/finance', signed(STAFF, 'sess-staff')), 'next')
  assert.equal(await outcome('/salary', signed(STAFF, 'sess-staff')), '/dashboard', 'พนักงานไม่มีโมดูลเงินเดือน')
  assert.equal(await outcome('/salary', signed(ADMIN, 'sess-admin')), 'next', 'แอดมินได้โมดูลเงินเดือนเสมอ')
  assert.equal(await outcome('/login', signed(STAFF, 'sess-staff')), '/dashboard', 'ล็อกอินแล้วเปิดหน้าล็อกอิน = ไปหน้าแรก')
  pass('สิทธิ์ตามโมดูลทำงานตามเดิม')

  // (5) QR กระเป๋า: /kits/<id>/check เข้าได้ด้วยสิทธิ์ stock หรือ events · ส่วนอื่นของ /kits ยังต้องมี stock
  const KIT = 'b3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
  const ev = signed(EVENTS_ONLY, 'sess-ev'), st = signed(STOCK_ONLY, 'sess-st'), no = signed(NEITHER, 'sess-no')
  assert.equal(await outcome(`/kits/${KIT}/check`, ev), 'next', 'มีแต่สิทธิ์อีเวนต์ สแกน QR กระเป๋าได้')
  for (const path of ['/kits', `/kits/${KIT}`, `/kits/${KIT}/print`, '/kits/print', `/kits/${KIT}/check/x`]) {
    assert.equal(await outcome(path, ev), '/dashboard', `มีแต่สิทธิ์อีเวนต์ต้องเข้า ${path} ไม่ได้`)
  }
  assert.equal(await outcome(`/kits/${KIT}/check`, no), '/dashboard', 'ไม่มีทั้ง stock และ events → เข้า QR กระเป๋าไม่ได้')
  assert.equal(await outcome(`/kits/${KIT}/check`, st), 'next', 'มีแต่สิทธิ์สต็อก สแกน QR กระเป๋าได้')
  assert.equal(await outcome('/kits', st), 'next')
  pass('QR กระเป๋า: events/stock เข้า /kits/<id>/check ได้ · events อย่างเดียวเข้า /kits ส่วนอื่นไม่ได้ · ไม่มีทั้งสองเข้าไม่ได้')

  // (6) ตั้งค่าคลัง /stock/settings อยู่ใต้โมดูลสต็อก
  assert.equal(await outcome('/stock/settings', st), 'next', 'มีสิทธิ์สต็อก เข้าตั้งค่าคลังได้')
  assert.equal(await outcome('/stock/settings', ev), '/dashboard', 'มีแต่สิทธิ์อีเวนต์ เข้าตั้งค่าคลังไม่ได้')
  assert.equal(await outcome('/stock/settings', no), '/dashboard', 'ไม่มีสิทธิ์สต็อก เข้าตั้งค่าคลังไม่ได้')
  pass('ตั้งค่าคลัง: stock เข้าได้ · events อย่างเดียว / ไม่มีสิทธิ์ → /dashboard')

  // (7) แพ็กเกจ /packages อยู่ใต้โมดูลสต็อก
  assert.equal(await outcome('/packages', st), 'next', 'มีสิทธิ์สต็อก เข้าหน้าแพ็กเกจได้')
  assert.equal(await outcome('/packages/new', st), 'next', 'มีสิทธิ์สต็อก เข้าหน้าเพิ่มแพ็กเกจได้')
  assert.equal(await outcome('/packages', ev), '/dashboard', 'มีแต่สิทธิ์อีเวนต์ เข้าหน้าแพ็กเกจไม่ได้')
  assert.equal(await outcome('/packages', no), '/dashboard', 'ไม่มีสิทธิ์สต็อก เข้าหน้าแพ็กเกจไม่ได้')
  pass('แพ็กเกจ: stock เข้าได้ · events อย่างเดียว / ไม่มีสิทธิ์ → /dashboard')

  // (8) ใบจัดของ /packing อยู่ใต้โมดูลสต็อก
  const LIST = 'c4a2d3e5-6f70-4b8c-9dae-1f2a3b4c5d6e'
  assert.equal(await outcome('/packing', st), 'next', 'มีสิทธิ์สต็อก เข้าคิวใบจัดของได้')
  assert.equal(await outcome(`/packing/${LIST}`, st), 'next', 'มีสิทธิ์สต็อก เปิดใบจัดของได้')
  assert.equal(await outcome('/packing', ev), '/dashboard', 'มีแต่สิทธิ์อีเวนต์ เข้าคิวใบจัดของไม่ได้')
  assert.equal(await outcome(`/packing/${LIST}`, ev), '/dashboard', 'มีแต่สิทธิ์อีเวนต์ เปิดใบจัดของไม่ได้')
  assert.equal(await outcome('/packing', no), '/dashboard', 'ไม่มีสิทธิ์สต็อก เข้าคิวใบจัดของไม่ได้')
  pass('ใบจัดของ: stock เข้าได้ · events อย่างเดียว / ไม่มีสิทธิ์ → /dashboard')

  // (9) QR จุดรับของ /pickup/<id> — stock หรือ events ผ่าน · ไม่มีทั้งสอง → /dashboard
  const SPOT = 'd5b3e4f6-7081-4c9d-8ebf-2a3b4c5d6e7f'
  assert.equal(await outcome(`/pickup/${SPOT}`, st), 'next', 'มีสิทธิ์สต็อก เปิดจุดรับของได้')
  assert.equal(await outcome(`/pickup/${SPOT}`, ev), 'next', 'มีแต่สิทธิ์อีเวนต์ เปิดจุดรับของได้')
  assert.equal(await outcome(`/pickup/${SPOT}`, no), '/dashboard', 'ไม่มีทั้ง stock และ events → เปิดจุดรับของไม่ได้')
  pass('จุดรับของ: stock / events เข้า /pickup/<id> ได้ · ไม่มีทั้งสอง → /dashboard')

  // (10) แดชบอร์ดการใช้งาน /stock/usage อยู่ใต้โมดูลสต็อก
  assert.equal(await outcome('/stock/usage', st), 'next', 'มีสิทธิ์สต็อก เข้าแดชบอร์ดการใช้งานได้')
  assert.equal(await outcome('/stock/usage', ev), '/dashboard', 'มีแต่สิทธิ์อีเวนต์ เข้าแดชบอร์ดการใช้งานไม่ได้')
  assert.equal(await outcome('/stock/usage', no), '/dashboard', 'ไม่มีสิทธิ์สต็อก เข้าแดชบอร์ดการใช้งานไม่ได้')
  pass('การใช้งานอุปกรณ์: stock เข้าได้ · events อย่างเดียว / ไม่มีสิทธิ์ → /dashboard')

  console.log('\nproxy-session: ผ่านทั้งหมด')
}

main().catch(e => { console.error('FAIL ', e); process.exit(1) })
