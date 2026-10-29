// ============================================================================
// ไฟล์ในบัคเก็ตส่วนตัว (M3) — เก็บ URL สาธารณะเดิมไว้ในฐานข้อมูลตามเดิม แต่ตอนแสดงผลแปลงเป็น /api/file/<bucket>/<path>
// route นั้นตรวจล็อกอินแล้ว redirect ไป signed URL อายุสั้น (บัคเก็ตเป็น private หลังรัน migration 20261031)
// ไฟล์กติกาล้วน: ไม่ import next/*, supabase หรือ react — ใช้ได้ทั้ง server, client และในชุดตรวจ
// ตรวจด้วย:  npx tsx scripts/file-url.check.ts
// ============================================================================

/** บัคเก็ตที่เก็บข้อมูลส่วนตัว/การเงิน — เปิดผ่าน /api/file เท่านั้น */
export const PRIVATE_BUCKETS = ['checkin-photos', 'receipts', 'crm-payment-proofs', 'login_selfies'] as const
export type PrivateBucket = (typeof PRIVATE_BUCKETS)[number]

export function isPrivateBucket(bucket: string): bucket is PrivateBucket {
  return (PRIVATE_BUCKETS as readonly string[]).includes(bucket)
}

const PUBLIC_PREFIX = '/storage/v1/object/public/'

/**
 * แยก { bucket, path } จาก URL สาธารณะของสตอเรจ ถ้าเป็นบัคเก็ตส่วนตัว — ไม่ใช่ = null
 * path คืนแบบเข้ารหัสตามที่เก็บ (เช่น %20) ไม่รวม ?query / #hash
 */
export function parsePrivateFileUrl(url: string | null | undefined): { bucket: PrivateBucket; path: string } | null {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null
  const base = url.split(/[?#]/)[0]
  const at = base.indexOf(PUBLIC_PREFIX, base.indexOf('//') + 2)
  if (at < 0) return null
  // ส่วนก่อน PUBLIC_PREFIX ต้องเป็น origin ล้วน (ไม่มี path อื่นนำหน้า)
  if (base.slice(base.indexOf('//') + 2, at).includes('/')) return null
  const rest = base.slice(at + PUBLIC_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const bucket = rest.slice(0, slash)
  const path = rest.slice(slash + 1)
  if (!isPrivateBucket(bucket) || !path) return null
  return { bucket, path }
}

/**
 * URL สำหรับแสดงผล (src / href / window.open): ไฟล์ในบัคเก็ตส่วนตัว → /api/file/<bucket>/<path>
 * ค่าอื่น (บัคเก็ตอื่น, path relative, blob:, data:) คืนเดิม · null/undefined → ''
 */
export function appFileUrl(url: string | null | undefined): string {
  if (url == null) return ''
  const hit = parsePrivateFileUrl(url)
  return hit ? `/api/file/${hit.bucket}/${hit.path}` : url
}
