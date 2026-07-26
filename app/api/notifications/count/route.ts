import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionLight } from '@/lib/auth'

export async function GET(request: Request) {
  const { userId } = await getSessionLight()
  if (!userId) {
    return NextResponse.json({ count: 0 }, { status: 401 })
  }

  // ?since=ISO — นับเฉพาะที่มาใหม่หลังเปิดกระดิ่งครั้งล่าสุด (badge แบบ "เห็นแล้วหาย")
  const since = new URL(request.url).searchParams.get('since')

  const supabase = createServiceClient()
  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (since) query = query.gt('created_at', since)

  const { count } = await query

  return NextResponse.json({ count: count || 0 })
}
