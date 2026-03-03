'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { cookies } from 'next/headers'


async function getSession() {
    const cookieStore = await cookies()
    const userId = cookieStore.get('session_user_id')?.value
    const role = cookieStore.get('session_role')?.value
    return { userId, role }
}

// ============================================================================
// System Users — fetch from profiles
// ============================================================================

export async function getSystemUsers() {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, department')
        .order('full_name', { ascending: true })

    if (error) return []
    return data || []
}

// ============================================================================
// Job Settings — CRUD
// ============================================================================

export interface JobSetting {
    id: string
    category: string
    value: string
    label_th: string
    label_en: string
    color: string | null
    sort_order: number
    is_active: boolean
    created_at: string
}

export async function getJobSettings(category?: string) {
    const supabase = createServiceClient()
    let query = supabase
        .from('job_settings')
        .select('*')
        .order('sort_order', { ascending: true })

    if (category) {
        query = query.eq('category', category)
    }

    const { data, error } = await query
    if (error) return { error: error.message, data: [] }
    return { data: data || [] }
}

export async function createJobSetting(formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const category = formData.get('category') as string
    const value = formData.get('value') as string
    const label_th = formData.get('label_th') as string
    const label_en = formData.get('label_en') as string
    const color = formData.get('color') as string || null
    const sort_order = formData.get('sort_order') ? Number(formData.get('sort_order')) : 0

    const { error } = await supabase.from('job_settings').insert({
        category, value, label_th, label_en, color, sort_order, is_active: true
    })

    if (error) return { error: error.message }

    await logActivity('CREATE_JOB_SETTING', { category, value, label_th })
    revalidatePath('/jobs')
    return { success: true }
}

export async function updateJobSetting(id: string, formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const updates: Record<string, unknown> = {}

    const fields = ['value', 'label_th', 'label_en', 'color', 'category']
    fields.forEach(f => {
        const v = formData.get(f)
        if (v !== null) updates[f] = v as string
    })
    if (formData.get('sort_order') !== null) updates.sort_order = Number(formData.get('sort_order') || 0)
    if (formData.has('is_active')) updates.is_active = formData.get('is_active') === 'true'

    const { error } = await supabase.from('job_settings').update(updates).eq('id', id)
    if (error) return { error: error.message }

    await logActivity('UPDATE_JOB_SETTING', { id, changes: Object.keys(updates).join(', ') })
    revalidatePath('/jobs')
    return { success: true }
}

export async function deleteJobSetting(id: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase.from('job_settings').delete().eq('id', id)
    if (error) return { error: error.message }

    await logActivity('DELETE_JOB_SETTING', { id })
    revalidatePath('/jobs')
    return { success: true }
}

export async function toggleJobSetting(id: string, is_active: boolean) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase.from('job_settings').update({ is_active }).eq('id', id)
    if (error) return { error: error.message }

    await logActivity('UPDATE_JOB_SETTING', { id, is_active })
    revalidatePath('/jobs')
    return { success: true }
}

// ============================================================================
// Job Types — Dynamic job type management
// ============================================================================

export async function getJobTypes() {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('job_settings')
        .select('*')
        .eq('category', 'job_type')
        .order('sort_order', { ascending: true })

    if (error) return { data: [], error: error.message }
    return { data: data || [] }
}

export async function createJobType(formData: FormData) {
    const supabase = createServiceClient()
    const value = (formData.get('value') as string)?.trim().toLowerCase().replace(/\s+/g, '_')
    const label_th = formData.get('label_th') as string
    const label_en = formData.get('label_en') as string
    const color = formData.get('color') as string || '#6b7280'
    const sort_order = parseInt(formData.get('sort_order') as string) || 0

    if (!value || !label_th || !label_en) return { error: 'Missing required fields' }

    const { error } = await supabase.from('job_settings').insert({
        category: 'job_type', value, label_th, label_en, color, sort_order,
    })
    if (error) return { error: error.message }
    revalidatePath('/jobs')
    return { success: true }
}

export async function updateJobType(id: string, formData: FormData) {
    const supabase = createServiceClient()
    const updates: Record<string, unknown> = {}
    const label_th = formData.get('label_th') as string
    const label_en = formData.get('label_en') as string
    const color = formData.get('color') as string
    if (label_th) updates.label_th = label_th
    if (label_en) updates.label_en = label_en
    if (color) updates.color = color

    const { error } = await supabase.from('job_settings').update(updates).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/jobs')
    return { success: true }
}

export async function deleteJobType(id: string) {
    const supabase = createServiceClient()
    const { error } = await supabase.from('job_settings').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/jobs')
    return { success: true }
}

// ============================================================================
// Jobs — CRUD
// ============================================================================

export type JobType = string

export interface Job {
    id: string
    crm_lead_id: string | null
    job_type: JobType
    status: string
    title: string
    description: string | null
    assigned_to: string[]
    assigned_graphics: string[]
    assigned_staff: string[]
    tags: string[]
    priority: string
    due_date: string | null
    event_date: string | null
    event_location: string | null
    customer_name: string | null
    notes: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    archived_at: string | null
}

export async function getJobs(filters?: {
    job_type?: string
    status?: string
    search?: string
    includeArchived?: boolean
}) {
    const supabase = createServiceClient()
    let query = supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })

    if (!filters?.includeArchived) {
        query = query.is('archived_at', null)
    }

    if (filters?.job_type) query = query.eq('job_type', filters.job_type)
    if (filters?.status) query = query.eq('status', filters.status)
    if (filters?.search) {
        const sanitized = filters.search.replace(/[.,()]/g, '').trim()
        if (sanitized) {
            query = query.or(`title.ilike.%${sanitized}%,customer_name.ilike.%${sanitized}%`)
        }
    }

    const { data, error } = await query
    if (error) return { error: error.message, data: [] }
    return { data: data || [] }
}

export async function getJob(id: string) {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .single()

    if (error) return { error: error.message, data: null }
    return { data }
}

export async function createJob(formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    const job = {
        crm_lead_id: formData.get('crm_lead_id') as string || null,
        job_type: formData.get('job_type') as string,
        status: formData.get('status') as string || 'pending',
        title: formData.get('title') as string,
        description: formData.get('description') as string || null,
        assigned_to: (formData.get('assigned_to') as string || '').split(',').filter(Boolean),
        tags: (formData.get('tags') as string || '').split(',').map(t => t.trim()).filter(Boolean),
        priority: formData.get('priority') as string || 'medium',
        due_date: formData.get('due_date') as string || null,
        event_date: formData.get('event_date') as string || null,
        event_location: formData.get('event_location') as string || null,
        customer_name: formData.get('customer_name') as string || null,
        notes: formData.get('notes') as string || null,
        created_by: userId,
    }

    const { data, error } = await supabase.from('jobs').insert(job).select().single()
    if (error) return { error: error.message }

    await logActivity('CREATE_JOB', { id: data.id, job_type: job.job_type, title: job.title })
    revalidatePath('/jobs')
    return { success: true, id: data.id }
}

export async function updateJob(id: string, formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    const textFields = ['title', 'description', 'event_location', 'customer_name', 'notes', 'priority']
    textFields.forEach(f => {
        const v = formData.get(f)
        if (v !== null) updates[f] = v as string || null
    })

    const dateFields = ['due_date', 'event_date']
    dateFields.forEach(f => {
        const v = formData.get(f)
        if (v !== null) updates[f] = (v as string) || null
    })

    // Tags
    if (formData.has('tags')) {
        const tagsStr = formData.get('tags') as string || ''
        updates.tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean)
    }

    // Assigned to
    if (formData.has('assigned_to')) {
        const str = formData.get('assigned_to') as string || ''
        updates.assigned_to = str.split(',').filter(Boolean)
    }

    // Assigned graphics (separate from staff)
    if (formData.has('assigned_graphics')) {
        const str = formData.get('assigned_graphics') as string || ''
        updates.assigned_graphics = str.split(',').filter(Boolean)
    }

    // Assigned staff (separate from graphics)
    if (formData.has('assigned_staff')) {
        const str = formData.get('assigned_staff') as string || ''
        updates.assigned_staff = str.split(',').filter(Boolean)
    }

    const { error } = await supabase.from('jobs').update(updates).eq('id', id)
    if (error) return { error: error.message }

    await logActivity('UPDATE_JOB', { id, changes: Object.keys(updates).join(', ') })
    revalidatePath('/jobs')
    revalidatePath(`/jobs/${id}`)
    return { success: true }
}

export async function updateJobStatus(id: string, newStatus: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    // Get current status
    const { data: job } = await supabase.from('jobs').select('status').eq('id', id).single()
    const oldStatus = job?.status || 'unknown'

    // Update status
    const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id)
    if (error) return { error: error.message }

    // Log activity
    await supabase.from('job_activities').insert({
        job_id: id,
        created_by: userId,
        activity_type: 'status_change',
        description: `สถานะเปลี่ยน: ${oldStatus} → ${newStatus}`,
        old_status: oldStatus,
        new_status: newStatus,
    })

    await logActivity('UPDATE_JOB_STATUS', { id, oldStatus, newStatus })
    revalidatePath('/jobs')
    revalidatePath(`/jobs/${id}`)
    return { success: true }
}

export async function updateJobTags(id: string, tags: string[]) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase
        .from('jobs')
        .update({ tags, updated_at: new Date().toISOString() })
        .eq('id', id)

    if (error) return { error: error.message }

    await logActivity('UPDATE_JOB_TAGS', { id, tags })
    revalidatePath('/jobs')
    revalidatePath(`/jobs/${id}`)
    return { success: true }
}

export async function deleteJob(id: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase.from('jobs').delete().eq('id', id)
    if (error) return { error: error.message }

    await logActivity('DELETE_JOB', { id })
    revalidatePath('/jobs')
    return { success: true }
}

export async function archiveJob(id: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase
        .from('jobs')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
    if (error) return { error: error.message }

    await supabase.from('job_activities').insert({
        job_id: id,
        created_by: userId,
        activity_type: 'note',
        description: 'ย้ายไปที่ Archive',
    })

    await logActivity('ARCHIVE_JOB', { id })
    revalidatePath('/jobs')
    revalidatePath(`/jobs/${id}`)
    return { success: true }
}

export async function unarchiveJob(id: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase
        .from('jobs')
        .update({ archived_at: null })
        .eq('id', id)
    if (error) return { error: error.message }

    await supabase.from('job_activities').insert({
        job_id: id,
        created_by: userId,
        activity_type: 'note',
        description: 'นำออกจาก Archive แล้ว',
    })

    await logActivity('UNARCHIVE_JOB', { id })
    revalidatePath('/jobs')
    revalidatePath(`/jobs/${id}`)
    return { success: true }
}

// ============================================================================
// Job Activities — บันทึกการติดตาม
// ============================================================================

export async function getJobActivities(jobId: string) {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('job_activities')
        .select('*, profiles:created_by(full_name)')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })

    if (error) return { error: error.message, data: [] }
    return { data: data || [] }
}

export async function createJobActivity(jobId: string, formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const activity_type = formData.get('activity_type') as string
    const description = formData.get('description') as string

    const { error } = await supabase.from('job_activities').insert({
        job_id: jobId,
        created_by: userId,
        activity_type,
        description,
    })

    if (error) return { error: error.message }

    await supabase.from('jobs').update({ updated_at: new Date().toISOString() }).eq('id', jobId)

    await logActivity('CREATE_JOB_ACTIVITY', { jobId, activity_type, description })
    revalidatePath(`/jobs/${jobId}`)
    return { success: true }
}

// ============================================================================
// Create Jobs from CRM Lead — ส่งต่องานจาก CRM
// ============================================================================

export async function createJobsFromLead(leadId: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    // Get lead data
    const { data: lead, error: leadErr } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('id', leadId)
        .single()

    if (leadErr || !lead) return { error: 'ไม่พบข้อมูล Lead' }

    // Get default first status for each pipeline
    const { data: graphicStatuses } = await supabase
        .from('job_settings')
        .select('value')
        .eq('category', 'status_graphic')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(1)

    const { data: onsiteStatuses } = await supabase
        .from('job_settings')
        .select('value')
        .eq('category', 'status_onsite')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(1)

    const graphicStatus = graphicStatuses?.[0]?.value || 'pending'
    const onsiteStatus = onsiteStatuses?.[0]?.value || 'preparing'

    const baseJob = {
        crm_lead_id: leadId,
        title: `${lead.customer_name} — ${lead.event_details || lead.package_name || 'งาน'}`,
        customer_name: lead.customer_name,
        event_date: lead.event_date,
        event_location: lead.event_location,
        notes: lead.notes,
        created_by: userId,
        priority: 'medium' as const,
        assigned_to: [] as string[],
        assigned_graphics: [] as string[],
        assigned_staff: [] as string[],
        tags: [] as string[],
    }

    // Create graphic job with assigned_graphics from lead
    const graphicJob = {
        ...baseJob,
        job_type: 'graphic',
        status: graphicStatus,
        assigned_to: lead.assigned_graphics || [],
        assigned_graphics: lead.assigned_graphics || [],
    }

    // Create onsite job with assigned_staff from lead
    const onsiteJob = {
        ...baseJob,
        job_type: 'onsite',
        status: onsiteStatus,
        assigned_to: lead.assigned_staff || [],
        assigned_staff: lead.assigned_staff || [],
    }

    const { data: jobs, error: insertErr } = await supabase
        .from('jobs')
        .insert([graphicJob, onsiteJob])
        .select()

    if (insertErr) return { error: insertErr.message }

    // Log activity in CRM
    await supabase.from('crm_activities').insert({
        lead_id: leadId,
        created_by: userId,
        activity_type: 'note',
        description: `ส่งต่องานแล้ว: กราฟฟิก + ออกหน้างาน`,
    })

    await logActivity('CREATE_JOBS_FROM_LEAD', { leadId, jobIds: jobs?.map(j => j.id) })
    revalidatePath('/jobs')
    revalidatePath('/crm')
    revalidatePath(`/crm/${leadId}`)
    return { success: true, jobs: jobs || [] }
}

// Get jobs linked to a CRM lead
export async function getJobsByLeadId(leadId: string) {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('jobs')
        .select('id, job_type, status, title, tags, created_at')
        .eq('crm_lead_id', leadId)
        .order('created_at', { ascending: false })

    if (error) return []
    return data || []
}

// Get full CRM lead data for job detail page
export async function getCrmLeadForJob(leadId: string) {
    const supabase = createServiceClient()
    const { data: lead, error } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('id', leadId)
        .single()

    if (error || !lead) return null

    // Get installments
    const { data: installments } = await supabase
        .from('crm_lead_installments')
        .select('*')
        .eq('lead_id', leadId)
        .order('installment_number', { ascending: true })

    // Get CRM settings for display labels
    const { data: crmSettings } = await supabase
        .from('crm_settings')
        .select('*')
        .order('sort_order', { ascending: true })

    return {
        lead,
        installments: installments || [],
        crmSettings: crmSettings || [],
    }
}

// ============================================================================
// Job Checklist Templates — CRUD (Settings)
// ============================================================================

export interface ChecklistTemplate {
    id: string
    job_type: JobType
    status: string
    group_name_th: string
    group_name_en: string
    items: { label_th: string; label_en: string }[]
    sort_order: number
    is_active: boolean
    created_at: string
}

export interface ChecklistItem {
    id: string
    job_id: string
    template_id: string
    item_index: number
    is_checked: boolean
    checked_by: string | null
    checked_at: string | null
}

export async function getChecklistTemplates(jobType?: JobType, status?: string) {
    const supabase = createServiceClient()
    let query = supabase
        .from('job_checklist_templates')
        .select('*')
        .order('sort_order', { ascending: true })

    if (jobType) query = query.eq('job_type', jobType)
    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) return { error: error.message, data: [] }
    return { data: (data || []) as ChecklistTemplate[] }
}

export async function createChecklistTemplate(formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const items = JSON.parse(formData.get('items') as string || '[]')

    const { error } = await supabase.from('job_checklist_templates').insert({
        job_type: formData.get('job_type') as string,
        status: formData.get('status') as string,
        group_name_th: formData.get('group_name_th') as string,
        group_name_en: formData.get('group_name_en') as string,
        items,
        sort_order: Number(formData.get('sort_order') || 0),
    })

    if (error) return { error: error.message }
    revalidatePath('/jobs/settings')
    return { success: true }
}

export async function updateChecklistTemplate(id: string, formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const updates: Record<string, unknown> = {}

    const fields = ['group_name_th', 'group_name_en', 'status']
    fields.forEach(f => {
        const v = formData.get(f)
        if (v !== null) updates[f] = v as string
    })

    if (formData.has('items')) {
        updates.items = JSON.parse(formData.get('items') as string || '[]')
    }
    if (formData.has('sort_order')) {
        updates.sort_order = Number(formData.get('sort_order') || 0)
    }
    if (formData.has('is_active')) {
        updates.is_active = formData.get('is_active') === 'true'
    }

    const { error } = await supabase.from('job_checklist_templates').update(updates).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/jobs/settings')
    return { success: true }
}

export async function deleteChecklistTemplate(id: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase.from('job_checklist_templates').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/jobs/settings')
    return { success: true }
}

// ============================================================================
// Job Checklist Items — per-job checkbox state
// ============================================================================

export async function getJobChecklists(jobId: string) {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('job_checklist_items')
        .select('*')
        .eq('job_id', jobId)

    if (error) return { error: error.message, data: [] }
    return { data: (data || []) as ChecklistItem[] }
}

export async function toggleChecklistItem(
    jobId: string,
    templateId: string,
    itemIndex: number,
    checked: boolean
) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    if (checked) {
        // Upsert — mark as checked
        const { error } = await supabase
            .from('job_checklist_items')
            .upsert({
                job_id: jobId,
                template_id: templateId,
                item_index: itemIndex,
                is_checked: true,
                checked_by: userId,
                checked_at: new Date().toISOString(),
            }, { onConflict: 'job_id,template_id,item_index' })

        if (error) return { error: error.message }
    } else {
        // Uncheck — update existing row
        const { error } = await supabase
            .from('job_checklist_items')
            .update({
                is_checked: false,
                checked_by: null,
                checked_at: null,
            })
            .eq('job_id', jobId)
            .eq('template_id', templateId)
            .eq('item_index', itemIndex)

        if (error) return { error: error.message }
    }

    revalidatePath(`/jobs/${jobId}`)
    return { success: true }
}

// ============================================================================
// Tickets — Types
// ============================================================================

export interface Ticket {
    id: string
    ticket_number: string
    subject: string
    category: string
    description: string | null
    priority: string
    desired_outcome: string | null
    attachments: string[]
    status: string
    created_by: string | null
    assigned_to: string[]
    closed_at: string | null
    archived_at: string | null
    created_at: string
    updated_at: string
    profiles?: { full_name: string | null } | null
}

export interface TicketReply {
    id: string
    ticket_id: string
    reply_type: string
    content: string | null
    attachments: string[]
    created_by: string | null
    created_at: string
    profiles?: { full_name: string | null } | null
}

// ============================================================================
// Tickets — CRUD
// ============================================================================

export async function getTickets(filters?: {
    category?: string
    status?: string
    search?: string
    includeArchived?: boolean
}) {
    const supabase = createServiceClient()
    let query = supabase
        .from('tickets')
        .select('*, profiles:created_by(full_name)')
        .order('created_at', { ascending: false })

    if (!filters?.includeArchived) {
        query = query.is('archived_at', null)
    }

    if (filters?.category) query = query.eq('category', filters.category)
    if (filters?.status) query = query.eq('status', filters.status)
    if (filters?.search) {
        const sanitized = filters.search.replace(/[.,()]/g, '').trim()
        if (sanitized) {
            query = query.or(`subject.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)
        }
    }

    const { data, error } = await query
    if (error) return { error: error.message, data: [] }
    return { data: (data || []) as Ticket[] }
}

export async function getTicket(id: string) {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('tickets')
        .select('*, profiles:created_by(full_name)')
        .eq('id', id)
        .single()

    if (error) return { error: error.message, data: null }
    return { data: data as Ticket }
}

export async function createTicket(formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    // Auto-generate ticket number
    const { count } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
    const ticketNum = `TK-${String((count || 0) + 1).padStart(3, '0')}`

    const ticket = {
        ticket_number: ticketNum,
        subject: formData.get('subject') as string,
        category: formData.get('category') as string,
        description: formData.get('description') as string || null,
        priority: formData.get('priority') as string || 'normal',
        desired_outcome: formData.get('desired_outcome') as string || null,
        attachments: JSON.parse(formData.get('attachments') as string || '[]'),
        status: 'open',
        created_by: userId,
    }

    const { data, error } = await supabase.from('tickets').insert(ticket).select().single()
    if (error) return { error: error.message }

    await logActivity('CREATE_TICKET', { id: data.id, subject: ticket.subject, category: ticket.category })
    revalidatePath('/jobs')
    return { success: true, id: data.id }
}

export async function updateTicketStatus(id: string, newStatus: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    const updates: Record<string, unknown> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
    }
    if (newStatus === 'closed') {
        updates.closed_at = new Date().toISOString()
    }

    const { error } = await supabase.from('tickets').update(updates).eq('id', id)
    if (error) return { error: error.message }

    // Add status change reply
    await supabase.from('ticket_replies').insert({
        ticket_id: id,
        reply_type: 'status_change',
        content: `สถานะเปลี่ยนเป็น: ${newStatus}`,
        created_by: userId,
    })

    await logActivity('UPDATE_TICKET_STATUS', { id, newStatus })
    revalidatePath('/jobs')
    revalidatePath(`/jobs/tickets/${id}`)
    return { success: true }
}

export async function getTicketReplies(ticketId: string) {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('ticket_replies')
        .select('*, profiles:created_by(full_name)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })

    if (error) return { error: error.message, data: [] }
    return { data: (data || []) as TicketReply[] }
}

export async function createTicketReply(ticketId: string, formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const reply = {
        ticket_id: ticketId,
        reply_type: formData.get('reply_type') as string || 'comment',
        content: formData.get('content') as string || null,
        attachments: JSON.parse(formData.get('attachments') as string || '[]'),
        created_by: userId,
    }

    const { error } = await supabase.from('ticket_replies').insert(reply)
    if (error) return { error: error.message }

    // Auto-update ticket status to in_progress if it's currently open
    const { data: ticket } = await supabase.from('tickets').select('status, created_by').eq('id', ticketId).single()
    if (ticket && ticket.status === 'open' && ticket.created_by !== userId) {
        await supabase.from('tickets').update({
            status: 'answered',
            updated_at: new Date().toISOString(),
        }).eq('id', ticketId)
    }

    await supabase.from('tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId)

    await logActivity('CREATE_TICKET_REPLY', { ticketId, reply_type: reply.reply_type })
    revalidatePath('/jobs')
    revalidatePath(`/jobs/tickets/${ticketId}`)
    return { success: true }
}

export async function deleteTicket(id: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase.from('tickets').delete().eq('id', id)
    if (error) return { error: error.message }

    await logActivity('DELETE_TICKET', { id })
    revalidatePath('/jobs')
    return { success: true }
}

export async function getTicketCategories() {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('job_settings')
        .select('*')
        .eq('category', 'ticket_category')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

    if (error) return { data: [], error: error.message }
    return { data: data || [] }
}

export async function getTicketOutcomes() {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('job_settings')
        .select('*')
        .eq('category', 'ticket_outcome')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

    if (error) return { data: [], error: error.message }
    return { data: data || [] }
}

// ============================================================================
// Archive — Jobs & Tickets
// ============================================================================

export async function getArchivedJobs() {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })

    if (error) return { error: error.message, data: [] }
    return { data: (data || []) as Job[] }
}

export async function getArchivedTickets() {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('tickets')
        .select('*, profiles:created_by(full_name)')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })

    if (error) return { error: error.message, data: [] }
    return { data: (data || []) as Ticket[] }
}

export async function archiveTicket(id: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase
        .from('tickets')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
    if (error) return { error: error.message }

    await logActivity('ARCHIVE_TICKET', { id })
    revalidatePath('/jobs')
    revalidatePath('/jobs/archive')
    return { success: true }
}

export async function unarchiveTicket(id: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase
        .from('tickets')
        .update({ archived_at: null })
        .eq('id', id)
    if (error) return { error: error.message }

    await logActivity('UNARCHIVE_TICKET', { id })
    revalidatePath('/jobs')
    revalidatePath('/jobs/archive')
    return { success: true }
}
