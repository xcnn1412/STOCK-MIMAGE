// proxy.ts — server action ที่ถูก proxy เด้งออก (session หลุด/ไม่มีสิทธิ์) ต้องได้ header
// x-action-redirect ไม่ใช่ 307 — เพราะ 307 ทำให้เบราว์เซอร์ POST ซ้ำไปที่ /login แล้วได้
// body ที่ไม่ใช่ RSC → ผู้ใช้เจอ "An unexpected response was received from the server"
//
// Run:  npx tsx scripts/proxy-action-redirect-check.ts
//
// ไม่แตะ DB — request ไม่มีคุกกี้ session จึงไม่มี query ไป Supabase

import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { proxy } from '../proxy'

// อ่านตอนเรียก proxy() ไม่ใช่ตอน import — ตั้งตรงนี้ได้
process.env.LICENSE_EXPIRES_AT = '2999-01-01T00:00:00Z'

async function main() {
  const action = await proxy(
    new NextRequest('http://localhost/salary/runs', {
      method: 'POST',
      headers: { 'next-action': '00abc' },
    })
  )
  assert.equal(action.headers.get('x-action-redirect'), '/login;replace', 'action ต้องได้ x-action-redirect')
  assert.equal(action.headers.get('location'), null, 'action ต้องไม่ถูก 307 ให้ POST ซ้ำ')

  const page = await proxy(new NextRequest('http://localhost/salary/runs'))
  assert.equal(page.status, 307, 'เปิดหน้าปกติยัง redirect แบบเดิม')
  assert.equal(new URL(page.headers.get('location') || '').pathname, '/login')

  console.log('PASS  proxy-action-redirect-check')
}

main().catch(e => {
  console.error('FAIL ', e.message)
  process.exit(1)
})
