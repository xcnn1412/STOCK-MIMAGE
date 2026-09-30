import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionLight } from '@/lib/auth'

/**
 * ตัวเลขของกระดิ่งและป๊อปอัปแจ้งเตือน — components/notification-poll.ts ถามที่นี่ครั้งเดียวต่อแท็บทุก 30 วินาที
 * count = ยังไม่อ่านที่มาใหม่หลัง ?since (เปิดกระดิ่งครั้งล่าสุด) · ไม่ส่ง since = ยังไม่อ่านทั้งหมด (แบบเดิม)
 * total = ยังไม่อ่านทั้งหมด (ป๊อปอัปดูว่าเพิ่มขึ้นไหม)
 */
export async function GET(request: Request) {
  const { userId } = await getSessionLight()
  if (!userId) {
    return NextResponse.json({ count: 0, total: 0 }, { status: 401 })
  }

  // ?since=ISO — นับเฉพาะที่มาใหม่หลังเปิดกระดิ่งครั้งล่าสุด (badge แบบ "เห็นแล้วหาย")
  const since = new URL(request.url).searchParams.get('since')

  const supabase = createServiceClient()
  const unread = () => supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  // นับสองแบบพร้อมกัน (รอบเดียว) · ไม่มี since = สองตัวเลขเท่ากัน นับครั้งเดียว
  const [sinceRes, totalRes] = await Promise.all([
    since ? unread().gt('created_at', since) : null,
    unread(),
  ])
  const total = totalRes.count || 0
  const count = sinceRes ? sinceRes.count || 0 : total

  return NextResponse.json({ count, total })
}
