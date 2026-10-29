import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import { isPrivateBucket } from '@/lib/file-url'

// ============================================================================
// GET /api/file/<bucket>/<path...> — เปิดไฟล์ในบัคเก็ตส่วนตัว (M3)
// หน้าจอได้ลิงก์นี้จาก lib/file-url.ts::appFileUrl(URL สาธารณะเดิมที่เก็บในฐานข้อมูล)
// ตรวจล็อกอิน → redirect 302 ไป signed URL อายุ 5 นาที (ดาวน์โหลด/ชื่อไฟล์ทำงานเหมือนลิงก์เดิม)
// อยู่ใต้ /api ซึ่ง proxy.ts ไม่ได้ตรวจ session — ต้องตรวจเองที่นี่
// รอบนี้ "ล็อกอินแล้ว" คือประตูเดียว: ยังไม่ตรวจสิทธิ์รายไฟล์ (ใบเบิกของใคร / เช็คอินของใคร) — ตั้งใจเลื่อนไปรอบถัดไป
// ============================================================================

/** อายุ signed URL (วินาที) */
const SIGNED_URL_TTL = 300

const json = (status: number, error: string) => Response.json({ error }, { status })

/** ถอด %xx ของแต่ละส่วน (Next อาจส่งมาแบบถอดแล้วหรือยังไม่ถอด) — ถอดไม่ได้ = ใช้ค่าเดิม */
function decodeSegment(s: string): string {
  if (!/%[0-9a-f]{2}/i.test(s)) return s
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ bucket: string; path: string[] }> }) {
  const session = await requireAuth()
  if (!session) return json(401, 'Unauthorized')

  const { bucket, path } = await ctx.params
  if (!bucket || !isPrivateBucket(bucket)) return json(404, 'ไม่พบไฟล์')

  const segments = (Array.isArray(path) ? path : []).map(decodeSegment)
  // ห้ามส่วนว่าง / . / .. / มีตัวคั่นซ่อนอยู่ในส่วนเดียว — กันชี้ออกนอก path ที่ตั้งใจ
  if (
    segments.length === 0
    || segments.some(s => !s || s === '.' || s === '..' || /[\/\0]/.test(s))
  ) {
    return json(404, 'ไม่พบไฟล์')
  }

  try {
    const { data, error } = await createServiceClient()
      .storage.from(bucket)
      .createSignedUrl(segments.join('/'), SIGNED_URL_TTL)
    if (error || !data?.signedUrl) return json(404, 'ไม่พบไฟล์')
    return new Response(null, {
      status: 302,
      headers: { Location: data.signedUrl, 'Cache-Control': 'private, no-store' },
    })
  } catch {
    return json(404, 'ไม่พบไฟล์')
  }
}
