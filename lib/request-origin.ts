import { headers } from 'next/headers'

// โดเมนจริงของคำขอ (หลัง proxy ของ Railway ใช้ x-forwarded-*) — QR ต้องเป็นลิงก์เต็ม
// ตั้ง env APP_ORIGIN (เช่น https://stk.imageautomat.com) = ใช้ค่าคงที่ ไม่เชื่อ header (L16: issuer ของ .well-known)
export async function requestOrigin(): Promise<string> {
  const fixed = process.env.APP_ORIGIN?.trim().replace(/\/+$/, '')
  if (fixed) return fixed
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
