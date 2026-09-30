// ============================================================================
// ตัวเลขการแจ้งเตือน — ถาม server ที่เดียวต่อแท็บ กระดิ่ง (notification-bell.tsx) และป๊อปอัป (notification-toast.tsx) ใช้ร่วมกัน
// เดิมกระดิ่ง 2 ตัว (จอใหญ่ + มือถือ ซ่อนด้วย CSS แต่ยังถามอยู่) ถามทุก 30 วินาที + ป๊อปอัปถามทุก 15 วินาที = 8 คำขอ/นาที/แท็บ
// ตอนนี้ถามครั้งเดียวทุก 30 วินาที = 2 คำขอ/นาที/แท็บ — ตรวจด้วย scripts/layout-requests.check.ts
//
// count = ยังไม่อ่านที่มาใหม่หลังเปิดกระดิ่งครั้งล่าสุด (LAST_SEEN_KEY) · total = ยังไม่อ่านทั้งหมด (ป๊อปอัปดูว่าเพิ่มขึ้นไหม)
// ไฟล์นี้เป็นที่เดียวของกลุ่ม component แจ้งเตือนที่ตั้ง timer และ fetch ตัวเลข (app/api/notifications/count/route.ts)
// ============================================================================

/** ถามทุก 30 วินาที */
export const POLL_MS = 30_000
/** เวลาที่เปิดกระดิ่งครั้งล่าสุด (localStorage) — เลขบนกระดิ่งนับเฉพาะที่มาใหม่หลังเวลานี้ */
export const LAST_SEEN_KEY = 'notif_last_seen'

export type NotificationCount = { count: number; total: number }
type Listener = (c: NotificationCount) => void

const listeners = new Set<Listener>()
let timer: ReturnType<typeof setInterval> | null = null
/** ตัวเลขล่าสุด — สมาชิกที่มาทีหลังได้ทันที · ล้างเมื่อไม่มีสมาชิก (เช่น ออกจากระบบแล้วเข้าใหม่ในแท็บเดิม) */
let latest: NotificationCount | null = null
/** ลำดับของคำขอ — คำตอบของคำขอที่เก่ากว่าคำขอล่าสุดถูกทิ้ง (ไม่ทับตัวเลขใหม่) */
let seq = 0

/** ถามตัวเลขเดี๋ยวนี้แล้วส่งให้สมาชิกทุกตัว — เครือข่ายล่ม/ server ตอบ error = คงตัวเลขเดิม */
export async function refreshNotificationCount(): Promise<void> {
  const mine = ++seq
  try {
    let since: string | null = null
    try {
      since = localStorage.getItem(LAST_SEEN_KEY)
    } catch { /* storage ถูกปิด — นับยังไม่อ่านทั้งหมด */ }
    const res = await fetch('/api/notifications/count' + (since ? `?since=${encodeURIComponent(since)}` : ''))
    if (!res.ok) return
    const data = await res.json()
    if (mine !== seq) return
    const next: NotificationCount = { count: Number(data.count) || 0, total: Number(data.total) || 0 }
    latest = next
    listeners.forEach(listener => listener(next))
  } catch { /* ignore network errors */ }
}

/**
 * รับตัวเลขทุกครั้งที่ถาม — สมาชิกตัวแรกเริ่มถาม (ทันที + ทุก POLL_MS) สมาชิกตัวสุดท้ายออกแล้วหยุด
 * คืนฟังก์ชันยกเลิก (ใช้เป็นค่าคืนของ useEffect ได้ตรงๆ)
 */
export function subscribeNotificationCount(listener: Listener): () => void {
  listeners.add(listener)
  if (latest) listener(latest)
  if (!timer) {
    timer = setInterval(refreshNotificationCount, POLL_MS)
    void refreshNotificationCount()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0 || !timer) return
    clearInterval(timer)
    timer = null
    latest = null
    seq++
  }
}
