'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

// ============================================================================
// Session helpers
// ============================================================================

async function getSession() {
    const cookieStore = await cookies()
    const userId = cookieStore.get('session_user_id')?.value
    const role = cookieStore.get('session_role')?.value
    return { userId, role }
}

// ============================================================================
// Personal Notes — Types
// ============================================================================

export interface PersonalNote {
    id: string
    user_id: string
    title: string
    content: string | null
    color: string | null
    is_pinned: boolean
    created_at: string
    updated_at: string
}

// ============================================================================
// Personal Notes — Queries
// ============================================================================

/** Fetch notes for the logged-in user (or a specific user for admin). */
export async function getPersonalNotes(targetUserId?: string) {
    const { userId, role } = await getSession()
    if (!userId) return { data: [] as PersonalNote[], error: 'Unauthorized' }

    // Only admins may query another user's notes
    const effectiveUserId = targetUserId && role === 'admin' ? targetUserId : userId

    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('personal_notes')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false })

    if (error) return { data: [] as PersonalNote[], error: error.message }
    return { data: (data || []) as PersonalNote[] }
}

// ============================================================================
// Personal Notes — Mutations
// ============================================================================

export async function createPersonalNote(formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase.from('personal_notes').insert({
        user_id: userId,
        title: (formData.get('title') as string || '').trim(),
        content: (formData.get('content') as string) || null,
        color: (formData.get('color') as string) || '#ffffff',
        is_pinned: formData.get('is_pinned') === 'true',
    })
    if (error) return { error: error.message }

    revalidatePath('/jobs/my-job')
    return { success: true }
}

export async function updatePersonalNote(id: string, formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    // Verify ownership before updating
    const { data: existing } = await supabase
        .from('personal_notes')
        .select('user_id')
        .eq('id', id)
        .single()
    if (!existing || existing.user_id !== userId) return { error: 'Forbidden' }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (formData.has('title')) updates.title = (formData.get('title') as string || '').trim()
    if (formData.has('content')) updates.content = (formData.get('content') as string) || null
    if (formData.has('color')) updates.color = formData.get('color') as string
    if (formData.has('is_pinned')) updates.is_pinned = formData.get('is_pinned') === 'true'

    const { error } = await supabase.from('personal_notes').update(updates).eq('id', id)
    if (error) return { error: error.message }

    revalidatePath('/jobs/my-job')
    return { success: true }
}

export async function toggleNotePin(id: string, is_pinned: boolean) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { data: existing } = await supabase.from('personal_notes').select('user_id').eq('id', id).single()
    if (!existing || existing.user_id !== userId) return { error: 'Forbidden' }

    const { error } = await supabase
        .from('personal_notes')
        .update({ is_pinned, updated_at: new Date().toISOString() })
        .eq('id', id)
    if (error) return { error: error.message }

    revalidatePath('/jobs/my-job')
    return { success: true }
}

export async function deletePersonalNote(id: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { data: existing } = await supabase.from('personal_notes').select('user_id').eq('id', id).single()
    if (!existing || existing.user_id !== userId) return { error: 'Forbidden' }

    const { error } = await supabase.from('personal_notes').delete().eq('id', id)
    if (error) return { error: error.message }

    revalidatePath('/jobs/my-job')
    return { success: true }
}

// ============================================================================
// Private Tickets — Types
// ============================================================================

export interface PrivateTicket {
    id: string
    user_id: string
    subject: string
    description: string | null
    priority: string
    status: string
    created_at: string
    updated_at: string
}

// ============================================================================
// Private Tickets — Queries
// ============================================================================

export async function getPrivateTickets(targetUserId?: string) {
    const { userId, role } = await getSession()
    if (!userId) return { data: [] as PrivateTicket[], error: 'Unauthorized' }

    const effectiveUserId = targetUserId && role === 'admin' ? targetUserId : userId

    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('private_tickets')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('created_at', { ascending: false })

    if (error) return { data: [] as PrivateTicket[], error: error.message }
    return { data: (data || []) as PrivateTicket[] }
}

// ============================================================================
// Private Tickets — Mutations
// ============================================================================

export async function createPrivateTicket(formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase.from('private_tickets').insert({
        user_id: userId,
        subject: (formData.get('subject') as string || '').trim(),
        description: (formData.get('description') as string) || null,
        priority: (formData.get('priority') as string) || 'normal',
        status: 'open',
    })
    if (error) return { error: error.message }

    revalidatePath('/jobs/my-job')
    return { success: true }
}

export async function updatePrivateTicket(id: string, formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { data: existing } = await supabase.from('private_tickets').select('user_id').eq('id', id).single()
    if (!existing || existing.user_id !== userId) return { error: 'Forbidden' }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (formData.has('subject')) updates.subject = (formData.get('subject') as string || '').trim()
    if (formData.has('description')) updates.description = (formData.get('description') as string) || null
    if (formData.has('priority')) updates.priority = formData.get('priority') as string
    if (formData.has('status')) updates.status = formData.get('status') as string

    const { error } = await supabase.from('private_tickets').update(updates).eq('id', id)
    if (error) return { error: error.message }

    revalidatePath('/jobs/my-job')
    return { success: true }
}

export async function deletePrivateTicket(id: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { data: existing } = await supabase.from('private_tickets').select('user_id').eq('id', id).single()
    if (!existing || existing.user_id !== userId) return { error: 'Forbidden' }

    const { error } = await supabase.from('private_tickets').delete().eq('id', id)
    if (error) return { error: error.message }

    revalidatePath('/jobs/my-job')
    return { success: true }
}
