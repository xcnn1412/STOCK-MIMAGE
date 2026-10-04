import { headers } from 'next/headers'

// โดเมนจริงของคำขอ (หลัง proxy ของ Railway ใช้ x-forwarded-*) — QR ต้องเป็นลิงก์เต็ม
export async function requestOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
