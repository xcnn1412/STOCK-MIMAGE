'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { getSessionLight } from '@/lib/auth'

// ============================================================================
// Notification Actions — สำหรับ frontend
// ============================================================================

export async function getUnreadCount() {
  const { userId } = await getSessionLight()
  if (!userId) return 0

  const supabase = createServiceClient()
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  return count || 0
}

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  reference_type: string
  reference_id: string
  is_read: boolean
  created_at: string
  actor: {
    full_name: string | null
    nickname: string | null
  } | null
}

export async function getNotifications(limit = 30): Promise<NotificationItem[]> {
  const { userId } = await getSessionLight()
  if (!userId) return []

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('notifications')
    .select(`
      id, type, title, body, reference_type, reference_id,
      is_read, created_at,
      actor:profiles!notifications_actor_id_fkey(full_name, nickname)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Supabase FK join returns actor as array — normalize to single object
  return (data || []).map((row: Record<string, unknown>) => ({
    ...row,
    actor: Array.isArray(row.actor) ? row.actor[0] || null : row.actor || null,
  })) as NotificationItem[]
}

export async function markAsRead(id: string) {
  const { userId } = await getSessionLight()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return { error: error.message }
  return { success: true }
}

export async function markAllAsRead() {
  const { userId } = await getSessionLight()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) return { error: error.message }
  return { success: true }
}
