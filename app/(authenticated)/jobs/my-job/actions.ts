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
// Types
// ============================================================================

export interface PersonalSetting {
    id: string
    user_id: string
    category: string
    value: string
    label_th: string
    label_en: string
    color: string | null
    sort_order: number
    is_active: boolean
    created_at: string
}

export interface PersonalJob {
    id: string
    user_id: string
    job_type: string
    status: string
    title: string
    description: string | null
    tags: string[]
    priority: string
    due_date: string | null
    notes: string | null
    sort_order: number
    created_at: string
    updated_at: string
    archived_at: string | null
}

export interface PersonalTicket {
    id: string
    user_id: string
    subject: string
    description: string | null
    status: string
    category: string
    priority: string
    outcome: string | null
    questions: string[]
    created_at: string
    updated_at: string
}

// ============================================================================
// My Job Settings — CRUD
// ============================================================================

/** Fetch all settings for the logged-in user (or a target user for admins). */
export async function getMyJobSettings(targetUserId?: string) {
    const { userId, role } = await getSession()
    if (!userId) return { data: [] as PersonalSetting[], error: 'Unauthorized' }

    const effectiveUserId = targetUserId && role === 'admin' ? targetUserId : userId

    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('my_job_settings')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('sort_order', { ascending: true })

    if (error) return { data: [] as PersonalSetting[], error: error.message }
    return { data: (data || []) as PersonalSetting[] }
}

export async function createMyJobSetting(formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase.from('my_job_settings').insert({
        user_id: userId,
        category: formData.get('category') as string,
        value: formData.get('value') as string,
        label_th: formData.get('label_th') as string,
        label_en: formData.get('label_en') as string,
        color: (formData.get('color') as string) || null,
        sort_order: Number(formData.get('sort_order') || 0),
        is_active: true,
    })
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    return { success: true }
}

export async function updateMyJobSetting(id: string, formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const updates: Record<string, unknown> = {}
    const fields = ['value', 'label_th', 'label_en', 'color']
    fields.forEach(f => {
        const v = formData.get(f)
        if (v !== null) updates[f] = (v as string) || null
    })
    if (formData.get('sort_order') !== null) updates.sort_order = Number(formData.get('sort_order') || 0)
    if (formData.has('is_active')) updates.is_active = formData.get('is_active') === 'true'

    const { error } = await supabase
        .from('my_job_settings')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    return { success: true }
}

export async function deleteMyJobSetting(id: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase
        .from('my_job_settings')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    return { success: true }
}

export async function toggleMyJobSetting(id: string, is_active: boolean) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase
        .from('my_job_settings')
        .update({ is_active })
        .eq('id', id)
        .eq('user_id', userId)
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    return { success: true }
}

/** Initialize settings with default pipeline/status/ticket config. No-op if already set up. */
export async function initMyJobDefaultSettings() {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    // Check if already initialized
    const { count } = await supabase
        .from('my_job_settings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)

    if ((count ?? 0) > 0) return { success: true, alreadyInitialized: true }

    const defaults = [
        // Job Types (pipelines)
        { user_id: userId, category: 'job_type', value: 'personal', label_th: 'งานส่วนตัว', label_en: 'Personal', color: '#8b5cf6', sort_order: 0, is_active: true },
        { user_id: userId, category: 'job_type', value: 'work',     label_th: 'งานบริษัท',   label_en: 'Work',     color: '#3b82f6', sort_order: 1, is_active: true },
        // Statuses — Personal
        { user_id: userId, category: 'status_personal', value: 'todo',        label_th: 'ยังไม่เริ่ม',       label_en: 'To Do',       color: '#9ca3af', sort_order: 0, is_active: true },
        { user_id: userId, category: 'status_personal', value: 'in_progress', label_th: 'กำลังทำ',           label_en: 'In Progress', color: '#3b82f6', sort_order: 1, is_active: true },
        { user_id: userId, category: 'status_personal', value: 'done',        label_th: 'เสร็จแล้ว',         label_en: 'Done',        color: '#10b981', sort_order: 2, is_active: true },
        // Statuses — Work
        { user_id: userId, category: 'status_work', value: 'pending',     label_th: 'รอดำเนินการ', label_en: 'Pending',     color: '#f59e0b', sort_order: 0, is_active: true },
        { user_id: userId, category: 'status_work', value: 'in_progress', label_th: 'กำลังทำ',     label_en: 'In Progress', color: '#3b82f6', sort_order: 1, is_active: true },
        { user_id: userId, category: 'status_work', value: 'review',      label_th: 'รอตรวจสอบ',   label_en: 'Review',      color: '#8b5cf6', sort_order: 2, is_active: true },
        { user_id: userId, category: 'status_work', value: 'done',        label_th: 'เสร็จแล้ว',   label_en: 'Done',        color: '#10b981', sort_order: 3, is_active: true },
        // Ticket Categories
        { user_id: userId, category: 'ticket_category', value: 'question', label_th: 'คำถาม',       label_en: 'Question', color: '#3b82f6', sort_order: 0, is_active: true },
        { user_id: userId, category: 'ticket_category', value: 'issue',    label_th: 'ปัญหา',        label_en: 'Issue',    color: '#ef4444', sort_order: 1, is_active: true },
        { user_id: userId, category: 'ticket_category', value: 'reminder', label_th: 'เตือนความจำ', label_en: 'Reminder', color: '#f59e0b', sort_order: 2, is_active: true },
        // Ticket Statuses
        { user_id: userId, category: 'status_ticket', value: 'open',        label_th: 'เปิด',              label_en: 'Open',        color: '#3b82f6', sort_order: 0, is_active: true },
        { user_id: userId, category: 'status_ticket', value: 'in_progress', label_th: 'กำลังดำเนินการ',   label_en: 'In Progress', color: '#f59e0b', sort_order: 1, is_active: true },
        { user_id: userId, category: 'status_ticket', value: 'closed',      label_th: 'ปิดแล้ว',           label_en: 'Closed',      color: '#10b981', sort_order: 2, is_active: true },
    ]

    const { error } = await supabase.from('my_job_settings').insert(defaults)
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    return { success: true }
}

// ============================================================================
// My Jobs — CRUD
// ============================================================================

export async function getMyJobs(targetUserId?: string) {
    const { userId, role } = await getSession()
    if (!userId) return { data: [] as PersonalJob[], error: 'Unauthorized' }

    const effectiveUserId = targetUserId && role === 'admin' ? targetUserId : userId

    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('my_jobs')
        .select('*')
        .eq('user_id', effectiveUserId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })

    if (error) return { data: [] as PersonalJob[], error: error.message }
    return { data: (data || []) as PersonalJob[] }
}

export async function createMyJob(formData: FormData, targetUserId?: string) {
    const { userId, role } = await getSession()
    if (!userId) return { error: 'Unauthorized' }
    const effectiveUserId = targetUserId && role === 'admin' ? targetUserId : userId

    const supabase = createServiceClient()
    const { error } = await supabase.from('my_jobs').insert({
        user_id: effectiveUserId,
        job_type: (formData.get('job_type') as string) || 'personal',
        status: (formData.get('status') as string) || 'todo',
        title: ((formData.get('title') as string) || '').trim(),
        description: (formData.get('description') as string) || null,
        tags: ((formData.get('tags') as string) || '').split(',').map(t => t.trim()).filter(Boolean),
        priority: (formData.get('priority') as string) || 'medium',
        due_date: (formData.get('due_date') as string) || null,
        notes: (formData.get('notes') as string) || null,
    })
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    if (targetUserId) revalidatePath('/jobs/admin-job')
    return { success: true }
}

export async function updateMyJob(id: string, formData: FormData, targetUserId?: string) {
    const { userId, role } = await getSession()
    if (!userId) return { error: 'Unauthorized' }
    const effectiveUserId = targetUserId && role === 'admin' ? targetUserId : userId

    const supabase = createServiceClient()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    const textFields = ['title', 'description', 'notes', 'priority', 'status', 'job_type']
    textFields.forEach(f => {
        const v = formData.get(f)
        if (v !== null) updates[f] = (v as string) || null
    })
    if (formData.has('due_date')) updates.due_date = (formData.get('due_date') as string) || null
    if (formData.has('tags'))     updates.tags = ((formData.get('tags') as string) || '').split(',').map(t => t.trim()).filter(Boolean)

    const { error } = await supabase
        .from('my_jobs')
        .update(updates)
        .eq('id', id)
        .eq('user_id', effectiveUserId)
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    if (targetUserId) revalidatePath('/jobs/admin-job')
    return { success: true }
}

export async function updateMyJobStatus(id: string, status: string, targetUserId?: string) {
    const { userId, role } = await getSession()
    if (!userId) return { error: 'Unauthorized' }
    const effectiveUserId = targetUserId && role === 'admin' ? targetUserId : userId

    const supabase = createServiceClient()
    const { error } = await supabase
        .from('my_jobs')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', effectiveUserId)
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    if (targetUserId) revalidatePath('/jobs/admin-job')
    return { success: true }
}

export async function archiveMyJob(id: string, targetUserId?: string) {
    const { userId, role } = await getSession()
    if (!userId) return { error: 'Unauthorized' }
    const effectiveUserId = targetUserId && role === 'admin' ? targetUserId : userId

    const supabase = createServiceClient()
    const { error } = await supabase
        .from('my_jobs')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', effectiveUserId)
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    if (targetUserId) revalidatePath('/jobs/admin-job')
    return { success: true }
}

export async function deleteMyJob(id: string, targetUserId?: string) {
    const { userId, role } = await getSession()
    if (!userId) return { error: 'Unauthorized' }
    const effectiveUserId = targetUserId && role === 'admin' ? targetUserId : userId

    const supabase = createServiceClient()
    const { error } = await supabase
        .from('my_jobs')
        .delete()
        .eq('id', id)
        .eq('user_id', effectiveUserId)
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    if (targetUserId) revalidatePath('/jobs/admin-job')
    return { success: true }
}

// ============================================================================
// My Tickets — CRUD
// ============================================================================

export async function getMyTickets(targetUserId?: string) {
    const { userId, role } = await getSession()
    if (!userId) return { data: [] as PersonalTicket[], error: 'Unauthorized' }

    const effectiveUserId = targetUserId && role === 'admin' ? targetUserId : userId

    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('my_tickets')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('created_at', { ascending: false })

    if (error) return { data: [] as PersonalTicket[], error: error.message }
    return { data: (data || []) as PersonalTicket[] }
}

export async function createMyTicket(formData: FormData, targetUserId?: string) {
    const { userId, role } = await getSession()
    if (!userId) return { error: 'Unauthorized' }
    const effectiveUserId = targetUserId && role === 'admin' ? targetUserId : userId

    const supabase = createServiceClient()
    const rawQuestions = formData.get('questions') as string
    let questions: string[] = []
    try { questions = rawQuestions ? JSON.parse(rawQuestions) : [] } catch { questions = [] }

    const { error } = await supabase.from('my_tickets').insert({
        user_id: effectiveUserId,
        subject: ((formData.get('subject') as string) || '').trim(),
        description: (formData.get('description') as string) || null,
        status: (formData.get('status') as string) || 'open',
        category: (formData.get('category') as string) || 'general',
        priority: (formData.get('priority') as string) || 'medium',
        outcome: (formData.get('outcome') as string) || null,
        questions: questions.filter(q => q.trim()),
    })
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    if (targetUserId) revalidatePath('/jobs/admin-job')
    return { success: true }
}

export async function updateMyTicket(id: string, formData: FormData, targetUserId?: string) {
    const { userId, role } = await getSession()
    if (!userId) return { error: 'Unauthorized' }
    const effectiveUserId = targetUserId && role === 'admin' ? targetUserId : userId

    const supabase = createServiceClient()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const fields = ['subject', 'description', 'status', 'category', 'priority', 'outcome']
    fields.forEach(f => {
        const v = formData.get(f)
        if (v !== null) updates[f] = (v as string) || null
    })
    if (formData.has('questions')) {
        try {
            const parsed = JSON.parse(formData.get('questions') as string)
            updates.questions = Array.isArray(parsed) ? parsed.filter((q: string) => q.trim()) : []
        } catch { updates.questions = [] }
    }

    const { error } = await supabase
        .from('my_tickets')
        .update(updates)
        .eq('id', id)
        .eq('user_id', effectiveUserId)
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    if (targetUserId) revalidatePath('/jobs/admin-job')
    return { success: true }
}

export async function updateMyTicketStatus(id: string, status: string, targetUserId?: string) {
    const { userId, role } = await getSession()
    if (!userId) return { error: 'Unauthorized' }
    const effectiveUserId = targetUserId && role === 'admin' ? targetUserId : userId

    const supabase = createServiceClient()
    const { error } = await supabase
        .from('my_tickets')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', effectiveUserId)
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    if (targetUserId) revalidatePath('/jobs/admin-job')
    return { success: true }
}

export async function deleteMyTicket(id: string, targetUserId?: string) {
    const { userId, role } = await getSession()
    if (!userId) return { error: 'Unauthorized' }
    const effectiveUserId = targetUserId && role === 'admin' ? targetUserId : userId

    const supabase = createServiceClient()
    const { error } = await supabase
        .from('my_tickets')
        .delete()
        .eq('id', id)
        .eq('user_id', effectiveUserId)
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    if (targetUserId) revalidatePath('/jobs/admin-job')
    return { success: true }
}

// ---- legacy: keep PersonalNote interface for any remaining references ----
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

// ============================================================================
// Comment Types
// ============================================================================

export interface MyJobComment {
    id: string
    job_id: string
    user_id: string
    content: string | null
    attachments: string[]
    created_at: string
    profiles?: { full_name: string | null; role: string | null } | null
}

export interface MyTicketComment {
    id: string
    ticket_id: string
    user_id: string
    content: string | null
    attachments: string[]
    created_at: string
    profiles?: { full_name: string | null; role: string | null } | null
}

// ============================================================================
// Job Comments — Queries & Mutations
// ============================================================================

export async function getMyJobComments(jobId: string) {
    const { userId } = await getSession()
    if (!userId) return { data: [] as MyJobComment[], error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('my_job_comments')
        .select('*, profiles(full_name, role)')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true })

    if (error) return { data: [] as MyJobComment[], error: error.message }
    return { data: (data || []) as MyJobComment[] }
}

export async function addMyJobComment(jobId: string, formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const content = (formData.get('content') as string | null)?.trim() || null
    const attachmentsRaw = formData.get('attachments') as string | null
    const attachments: string[] = attachmentsRaw ? JSON.parse(attachmentsRaw) : []

    if (!content && attachments.length === 0) return { error: 'Empty comment' }

    const supabase = createServiceClient()
    const { error } = await supabase.from('my_job_comments').insert({
        job_id: jobId,
        user_id: userId,
        content,
        attachments,
    })
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    revalidatePath('/jobs/admin-job')
    return { success: true }
}

export async function deleteMyJobComment(commentId: string) {
    const { userId, role } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { data: comment } = await supabase
        .from('my_job_comments')
        .select('user_id')
        .eq('id', commentId)
        .single()

    if (!comment) return { error: 'Not found' }
    if (comment.user_id !== userId && role !== 'admin') return { error: 'Forbidden' }

    const { error } = await supabase.from('my_job_comments').delete().eq('id', commentId)
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    revalidatePath('/jobs/admin-job')
    return { success: true }
}

// ============================================================================
// Ticket Comments — Queries & Mutations
// ============================================================================

export async function getMyTicketComments(ticketId: string) {
    const { userId } = await getSession()
    if (!userId) return { data: [] as MyTicketComment[], error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('my_ticket_comments')
        .select('*, profiles(full_name, role)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })

    if (error) return { data: [] as MyTicketComment[], error: error.message }
    return { data: (data || []) as MyTicketComment[] }
}

export async function addMyTicketComment(ticketId: string, formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const content = (formData.get('content') as string | null)?.trim() || null
    const attachmentsRaw = formData.get('attachments') as string | null
    const attachments: string[] = attachmentsRaw ? JSON.parse(attachmentsRaw) : []

    if (!content && attachments.length === 0) return { error: 'Empty comment' }

    const supabase = createServiceClient()
    const { error } = await supabase.from('my_ticket_comments').insert({
        ticket_id: ticketId,
        user_id: userId,
        content,
        attachments,
    })
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    revalidatePath('/jobs/admin-job')
    return { success: true }
}

export async function deleteMyTicketComment(commentId: string) {
    const { userId, role } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { data: comment } = await supabase
        .from('my_ticket_comments')
        .select('user_id')
        .eq('id', commentId)
        .single()

    if (!comment) return { error: 'Not found' }
    if (comment.user_id !== userId && role !== 'admin') return { error: 'Forbidden' }

    const { error } = await supabase.from('my_ticket_comments').delete().eq('id', commentId)
    if (error) return { error: error.message }
    revalidatePath('/jobs/my-job')
    revalidatePath('/jobs/admin-job')
    return { success: true }
}

// ============================================================================
// Comment Image Upload
// ============================================================================

export async function uploadMyCommentAttachments(
    formData: FormData,
): Promise<{ urls: string[]; error?: string }> {
    const { userId } = await getSession()
    if (!userId) return { urls: [], error: 'Unauthorized' }

    const supabase = createServiceClient()
    const files = formData.getAll('files') as File[]
    const urls: string[] = []
    const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp']

    for (const file of files) {
        if (!file.size) continue
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
        if (!allowed.includes(ext)) continue
        if (file.size > 20 * 1024 * 1024) continue // 20 MB cap

        const path = `my-job-comments/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        const { error } = await supabase.storage
            .from('ticket-attachments')
            .upload(path, buffer, { contentType: file.type, upsert: false })

        if (!error) {
            const { data: urlData } = supabase.storage
                .from('ticket-attachments')
                .getPublicUrl(path)
            if (urlData?.publicUrl) urls.push(urlData.publicUrl)
        }
    }

    return { urls }
}
