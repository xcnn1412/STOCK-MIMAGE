'use server'

// WORLDCUP 2026 (temporary feature) — delete this folder after the tournament.

import { requireAuth, getSessionLight } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import { revalidatePath } from 'next/cache'
import { WORLDCUP_TEAMS, WORLDCUP_ENDS_MS } from './teams'

export async function saveWorldCupPick(team: string) {
  const session = await requireAuth()
  if (!session) return { error: 'Unauthorized' }
  if (!WORLDCUP_TEAMS.some(t => t.key === team)) return { error: 'ทีมไม่ถูกต้อง' }
  if (Date.now() > WORLDCUP_ENDS_MS) return { error: 'บอลโลกจบไปแล้ว — หมดเวลาทาย' }

  const supabase = createServiceClient()
  // PK on user_id = one pick forever; a second insert hits 23505 (no change allowed)
  const { error } = await supabase
    .from('worldcup_predictions')
    .insert({ user_id: session.userId, team })

  if (error) {
    if (error.code === '23505') return { error: 'คุณทายไปแล้ว — เปลี่ยนทีมไม่ได้นะ!' }
    return { error: `บันทึกไม่สำเร็จ: ${error.message}` }
  }

  await logActivity('WORLDCUP_PICK', { team })
  revalidatePath('/', 'layout')
  return { success: true }
}

// Results summary for the post-tournament popup — every user's pick, oldest first.
export async function getWorldCupResults() {
  const session = await getSessionLight()
  if (!session) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('worldcup_predictions')
    .select('team, created_at, profiles(full_name)')
    .order('created_at', { ascending: true })
  if (error) return { error: error.message }

  return {
    rows: (data ?? []).map(r => ({
      team: r.team as string,
      createdAt: r.created_at as string,
      name: ((r.profiles as unknown as { full_name?: string } | null)?.full_name) || '—',
    })),
  }
}
