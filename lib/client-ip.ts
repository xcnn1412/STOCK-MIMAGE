/**
 * IP ของผู้เรียกหลัง Cloudflare — คีย์ rate limit (OAuth, ล็อกอิน) และ IP ใน activity log
 * ลำดับ: cf-connecting-ip (Cloudflare ตั้งเอง client ทับไม่ได้) → ค่า**สุดท้าย**ของ x-forwarded-for
 * (proxy ที่ใกล้เราที่สุดเติม — ค่าแรก client ใส่เองได้ เพราะ Cloudflare ต่อท้าย ไม่ทับ) → 'unknown'
 * รับได้ทั้ง Request.headers และผลของ headers() จาก next/headers
 * ponytail: ไม่ตรวจว่า hop สุดท้ายเป็น IP ของ Cloudflare จริง — เพดานรวมต่อ endpoint คุมกรณี header ปลอมแทน
 */
export function clientIp(h: { get(name: string): string | null }): string {
  const cf = h.get('cf-connecting-ip')?.trim()
  if (cf) return cf
  const hops = (h.get('x-forwarded-for') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return hops[hops.length - 1] ?? 'unknown'
}
