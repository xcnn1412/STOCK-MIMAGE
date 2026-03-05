import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionLight } from '@/lib/auth'

export async function GET() {
  const { userId } = await getSessionLight()
  if (!userId) {
    return NextResponse.json({ count: 0 }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  return NextResponse.json({ count: count || 0 })
}
