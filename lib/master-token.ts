import { createHash, timingSafeEqual } from 'crypto'

/**
 * ตรวจ header `x-master-token` ของคำขอ endpoint schema/migration ของ master
 * - ไม่ตั้ง env `MASTER_API_TOKEN` (หรือว่าง) → false เสมอ (fail-closed)
 * - เทียบแบบ constant-time บน sha256 ของทั้งสองฝั่ง เพื่อให้ความยาวเท่ากันเสมอ
 */
export function masterTokenOk(req: Request): boolean {
  const expected = process.env.MASTER_API_TOKEN
  if (!expected) return false
  const given = req.headers.get('x-master-token') ?? ''
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
