'use server'

import { createServiceClient } from '@/lib/supabase-server'

// ============================================================================
// Types
// ============================================================================

export type NotificationType =
  | 'job_assigned'
  | 'job_status_changed'
  | 'job_mentioned'
  | 'job_comment'
  | 'ticket_assigned'
  | 'ticket_reply'
  | 'expense_approved'
  | 'expense_rejected'

export type ReferenceType = 'job' | 'ticket' | 'expense_claim'

interface CreateNotificationParams {
  userIds: string[]
  type: NotificationType
  title: string
  body?: string
  referenceType: ReferenceType
  referenceId: string
  actorId: string
}

// ============================================================================
// Create Notifications (batch insert, skip self-notification)
// ============================================================================

export async function createNotifications(params: CreateNotificationParams) {
  const { userIds, type, title, body, referenceType, referenceId, actorId } = params

  // Filter out: actor (don't notify self) + duplicates + nulls
  const recipients = [...new Set(userIds.filter(id => id && id !== actorId))]
  if (recipients.length === 0) return

  const supabase = createServiceClient()

  const rows = recipients.map(userId => ({
    user_id: userId,
    type,
    title,
    body: body || null,
    reference_type: referenceType,
    reference_id: referenceId,
    actor_id: actorId,
  }))

  const { error } = await supabase.from('notifications').insert(rows)
  if (error) {
    console.error('[Notifications] Failed to create:', error.message)
  }
}
