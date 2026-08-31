'use server'

import { createServiceClient, removeStorageByUrls } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { createNotifications } from '@/lib/notifications'
import { cookies } from 'next/headers'
import { requireAuth } from '@/lib/auth'
// โมดูลตรรกะล้วน (ไม่มี React / ไม่มี 'use client') — import เข้ามาใน server action ได้
import {
    READY_DESIGN_STATUSES, kitBookingConflict, shouldFinishGraphicJob,
    canActOnPool, POOL_TEAM_CATEGORIES, POOL_TEAM_DEFAULTS, isClosedEvent,
    PREP_DUTY_CATEGORY, DUTY_LABELS_TH, isPrepDuty,
} from './tracking/tracking-logic'
import type { PoolTeamCategory, PrepDuty } from './tracking/tracking-logic'
import { DESIGN_STATUS_VALUES } from './tracking/design-options'
import { DEPARTMENTS } from '@/lib/departments'


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

    // Notify assigned users
    if (job.assigned_to.length > 0) {
        await createNotifications({
            userIds: job.assigned_to,
            type: 'job_assigned',
            title: `คุณได้รับมอบหมายงาน: ${job.title}`,
            referenceType: 'job',
            referenceId: data.id,
            actorId: userId,
        })
    }

    revalidatePath('/jobs')
    return { success: true, id: data.id }
}

export async function updateJob(id: string, formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    // Fetch current job for comparing assignees
    const { data: currentJob } = await supabase.from('jobs').select('title, assigned_to, assigned_graphics, assigned_staff').eq('id', id).single()
    const oldAssigned = currentJob?.assigned_to || []

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

    // Notify newly assigned users
    const jobTitle = (updates.title as string) || currentJob?.title || 'งาน'
    if (updates.assigned_to) {
        const newAssigned = (updates.assigned_to as string[]).filter(uid => !oldAssigned.includes(uid))
        if (newAssigned.length > 0) {
            await createNotifications({
                userIds: newAssigned,
                type: 'job_assigned',
                title: `คุณได้รับมอบหมายงาน: ${jobTitle}`,
                referenceType: 'job',
                referenceId: id,
                actorId: userId,
            })
        }
    }

    revalidatePath('/jobs')
    revalidatePath(`/jobs/${id}`)
    return { success: true }
}

export async function updateJobStatus(id: string, newStatus: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    // Get current job data
    const { data: job } = await supabase.from('jobs').select('status, title, assigned_to, created_by').eq('id', id).single()
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

    // Notify assigned + creator
    const recipients = [...(job?.assigned_to || []), job?.created_by].filter(Boolean) as string[]
    if (recipients.length > 0) {
        await createNotifications({
            userIds: recipients,
            type: 'job_status_changed',
            title: `งาน "${job?.title || 'งาน'}" เปลี่ยนสถานะ: ${oldStatus} → ${newStatus}`,
            referenceType: 'job',
            referenceId: id,
            actorId: userId,
        })
    }

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

    // Notify assigned + creator about new comment
    const { data: job } = await supabase.from('jobs').select('title, assigned_to, created_by').eq('id', jobId).single()
    if (job) {
        const recipients = [...(job.assigned_to || []), job.created_by].filter(Boolean) as string[]
        // Also notify mentioned users from formData
        const mentionedUsers = (formData.get('notify_users') as string || '').split(',').filter(Boolean)
        const allRecipients = [...recipients, ...mentionedUsers]

        await createNotifications({
            userIds: allRecipients,
            type: mentionedUsers.length > 0 ? 'job_mentioned' : 'job_comment',
            title: `มีความคิดเห็นใหม่ในงาน: ${job.title}`,
            body: description?.substring(0, 200),
            referenceType: 'job',
            referenceId: jobId,
            actorId: userId,
        })
    }

    revalidatePath(`/jobs/${jobId}`)
    return { success: true }
}

// ============================================================================
// Create Jobs from CRM Lead — ส่งต่องานจาก CRM
// ============================================================================

/** ประเภทใบงานที่แตกออกจากการ์ด CRM ได้ */
type LeadJobType = 'graphic' | 'onsite'

const LEAD_JOB_LABEL_TH: Record<LeadJobType, string> = {
    graphic: 'กราฟฟิก',
    onsite: 'ออกหน้างาน',
}

type CreatedJobRow = { id: string; job_type: string; title: string }

/**
 * สร้างใบงานของ lead เฉพาะ "ประเภทที่ยังไม่มี" — ตัวกันสร้างซ้ำแยกรายประเภท
 * (งานที่มีใบงานหน้างานแล้วยังเปิดใบงานกราฟิกทีหลังได้ และกลับกัน)
 * ใบที่สร้างเข้าพูลด้วยสถานะ "รอรับงาน" + แจ้งทีมของฝ่ายนั้นจากที่นี่ที่เดียว
 * ผู้เรียกเป็นคน logActivity / revalidatePath เอง (แต่ละทางเข้าใช้ ActionType คนละตัว)
 */
async function createLeadJobs(
    leadId: string,
    types: LeadJobType[],
    userId: string,
    activityText?: string,
    opts?: { allowExisting?: boolean }
) {
    const supabase = createServiceClient()

    // Get lead data
    const { data: lead, error: leadErr } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('id', leadId)
        .single()

    if (leadErr || !lead) return { error: 'ไม่พบข้อมูล Lead' }

    // dedupe รายประเภท: ประเภทที่มีใบงานของ lead นี้อยู่แล้วจะถูกข้าม
    const { data: existing, error: existingErr } = await supabase
        .from('jobs')
        .select('job_type')
        .eq('crm_lead_id', leadId)

    if (existingErr) return { error: existingErr.message }

    const already = new Set((existing || []).map(r => r.job_type as string))
    // allowExisting: เปิดใบซ้ำประเภทเดิมได้ (ใบงานกราฟิกเปิดหลายใบต่องาน — client ยืนยันกับผู้ใช้มาแล้ว)
    const wanted = opts?.allowExisting ? types : types.filter(t => !already.has(t))
    const skipped = opts?.allowExisting ? [] : types.filter(t => already.has(t))
    if (wanted.length === 0) return { success: true as const, jobs: [] as CreatedJobRow[], skipped }
    const graphicCount = (existing || []).filter(r => r.job_type === 'graphic').length

    // Get default first status for each pipeline (แถว is_active ที่ sort_order ต่ำสุด = "รอรับงาน")
    const firstStatus = async (category: string, fallback: string) => {
        const { data } = await supabase
            .from('job_settings')
            .select('value')
            .eq('category', category)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .limit(1)
        return (data?.[0]?.value as string) || fallback
    }

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

    const rows = []
    for (const type of wanted) {
        if (type === 'graphic') {
            // Create graphic job with assigned_graphics from lead
            rows.push({
                ...baseJob,
                // ใบที่สองขึ้นไปต่อท้ายเลขไว้แยกใบในพูล (ใบแรกไม่มีเลข)
                title: graphicCount > 0 ? `${baseJob.title} #${graphicCount + 1}` : baseJob.title,
                job_type: 'graphic',
                status: await firstStatus('status_graphic', 'pending'),
                // สถานะออกแบบอยู่รายใบ — ใบใหม่เริ่มที่ "ยังไม่เริ่ม" เสมอ ไม่รับค่าจากใบอื่น/จากงาน
                design_status: 'not_started',
                assigned_to: lead.assigned_graphics || [],
                assigned_graphics: lead.assigned_graphics || [],
            })
        } else {
            // Create onsite job with assigned_staff from lead
            rows.push({
                ...baseJob,
                job_type: 'onsite',
                status: await firstStatus('status_onsite', 'preparing'),
                assigned_to: lead.assigned_staff || [],
                assigned_staff: lead.assigned_staff || [],
            })
        }
    }

    const { data: jobs, error: insertErr } = await supabase.from('jobs').insert(rows).select()

    if (insertErr) return { error: insertErr.message }

    // Log activity in CRM
    await supabase.from('crm_activities').insert({
        lead_id: leadId,
        created_by: userId,
        activity_type: 'note',
        description: activityText ?? `ส่งต่องานแล้ว: ${wanted.map(t => LEAD_JOB_LABEL_TH[t]).join(' + ')}`,
    })

    const created = (jobs || []) as CreatedJobRow[]
    for (const job of created) {
        await notifyPoolNewJob(job, userId)
    }

    return { success: true as const, jobs: created, skipped }
}

/**
 * ปุ่ม "ส่งต่องาน" บนการ์ด CRM — เติมใบงานประเภทที่ยังไม่มีให้ครบ (ไม่สร้างซ้ำประเภทที่มีแล้ว)
 */
export async function createJobsFromLead(leadId: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const result = await createLeadJobs(leadId, ['graphic', 'onsite'], userId)
    if ('error' in result) return { error: result.error }

    await logActivity('CREATE_JOBS_FROM_LEAD', { leadId, jobIds: result.jobs.map(j => j.id) })
    revalidatePath('/jobs')
    revalidatePath('/jobs/tracking')
    revalidatePath('/crm')
    revalidatePath(`/crm/${leadId}`)
    return { success: true, jobs: result.jobs, skipped: result.skipped }
}

/**
 * เปิดใบงานกราฟิกเองจากการ์ด CRM — ใบงานกราฟิกไม่เกิดอัตโนมัติตอนตอบรับแล้ว
 * (งานที่ลูกค้าออกแบบเองจะได้ไม่มีใบงานกราฟิกที่ต้องตามไปกด "ข้าม" ทีหลัง)
 */
export async function openGraphicJob(leadId: string, opts?: { allowDuplicate?: boolean }) {
    const auth = await requireAuth()
    if (!auth) return { error: 'ไม่ได้เข้าสู่ระบบ' }

    const supabase = createServiceClient()
    const { data: lead } = await supabase
        .from('crm_leads')
        .select('id, status')
        .eq('id', leadId)
        .single()

    if (!lead) return { error: 'ไม่พบข้อมูล Lead' }
    if (lead.status !== 'accepted') return { error: 'เปิดใบงานกราฟิกได้เมื่องานตอบรับแล้วเท่านั้น' }

    // เปิดหลายใบต่องานได้ แต่ต้องยืนยันซ้ำจากฝั่ง client ก่อน (allowDuplicate)
    // ไม่ยืนยัน = พฤติกรรมเดิม: มีใบแล้วไม่สร้างเพิ่ม
    const result = await createLeadJobs(
        leadId, ['graphic'], auth.userId,
        'เปิดใบงานกราฟิกแล้ว — เข้าพูลรอรับงาน',
        { allowExisting: opts?.allowDuplicate === true }
    )
    if ('error' in result) return { error: result.error }
    if (result.jobs.length === 0) return { error: 'งานนี้มีใบงานกราฟิกแล้ว' }

    await logActivity('OPEN_GRAPHIC_JOB', { leadId, jobId: result.jobs[0].id })
    revalidatePath('/jobs')
    revalidatePath('/jobs/tracking')
    revalidatePath('/crm')
    revalidatePath(`/crm/${leadId}`)
    return { success: true, job: result.jobs[0] }
}

// ============================================================================
// พูลงาน — ทีมที่รับใบงานแต่ละประเภท + แจ้งเตือน "ใบงานใหม่เข้าพูล"
// ============================================================================

type PoolJobType = 'graphic' | 'onsite'

// ทีม = แผนก (profiles.department) ตั้งค่าได้ราย category ใน job_settings
// (UI ตั้งค่าอยู่ในแท็บ "ทีมของพูลงาน" หน้า /jobs/settings) ยังไม่มีแถวตั้งค่า = ใช้ค่าเริ่มต้น
// จาก POOL_TEAM_DEFAULTS เพื่อให้ระบบใช้งานได้ทันทีก่อนแอดมินเข้าไปตั้งค่า
const POOL_TEAM_CATEGORY: Record<PoolJobType, PoolTeamCategory> = {
    graphic: 'pool_team_graphic',
    onsite: 'pool_team_onsite',
}

const POOL_TEAM_DEFAULT_DEPARTMENTS: Record<PoolJobType, string[]> = {
    graphic: [...POOL_TEAM_DEFAULTS.pool_team_graphic],
    onsite: [...POOL_TEAM_DEFAULTS.pool_team_onsite],
}

/** แผนกที่ตั้งไว้ใน job_settings หมวดหนึ่ง — ยังไม่มีแถวตั้งค่า = ใช้ค่าเริ่มต้นที่ส่งมา */
async function getDepartmentSetting(category: string, fallback: string[]): Promise<string[]> {
    const supabase = createServiceClient()
    const { data } = await supabase
        .from('job_settings')
        .select('value')
        .eq('category', category)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

    const departments = (data || []).map(r => r.value as string).filter(Boolean)
    return departments.length > 0 ? departments : fallback
}

async function getPoolTeamDepartments(jobType: PoolJobType): Promise<string[]> {
    return getDepartmentSetting(POOL_TEAM_CATEGORY[jobType], POOL_TEAM_DEFAULT_DEPARTMENTS[jobType])
}

/**
 * บันทึกแผนกของหมวดหนึ่ง (แอดมินเท่านั้น) — ลบแถวเดิมของหมวดนั้นทิ้งแล้วใส่ชุดใหม่ตามลำดับที่เลือก
 * ไม่เลือกเลย = ไม่มีแถว = ตกกลับไปใช้ค่าเริ่มต้นตอนอ่าน (getDepartmentSetting)
 */
export async function savePoolTeamSetting(category: string, departments: string[]) {
    const auth = await requireAuth()
    if (!auth) return { error: 'ไม่ได้เข้าสู่ระบบ' }
    if (auth.role !== 'admin') return { error: 'เฉพาะแอดมินเท่านั้นที่ตั้งค่าทีมของพูลงานได้' }

    if (!POOL_TEAM_CATEGORIES.includes(category as PoolTeamCategory)) {
        return { error: 'หมวดการตั้งค่าไม่ถูกต้อง' }
    }

    const picked = [...new Set(departments || [])]
    if (picked.some(d => !DEPARTMENTS.includes(d))) {
        return { error: 'มีแผนกที่ไม่อยู่ในรายการแผนกของระบบ' }
    }

    const supabase = createServiceClient()
    const { error: delError } = await supabase.from('job_settings').delete().eq('category', category)
    if (delError) return { error: delError.message }

    if (picked.length > 0) {
        const { error: insError } = await supabase.from('job_settings').insert(
            picked.map((value, index) => ({
                category,
                value,
                label_th: value,
                label_en: value,
                color: null,
                sort_order: index,
                is_active: true,
            }))
        )
        if (insError) return { error: insError.message }
    }

    await logActivity('UPDATE_POOL_TEAM_SETTINGS', { category, departments: picked })
    revalidatePath('/jobs/settings')
    revalidatePath('/jobs/tracking')
    return { success: true }
}

// แจ้งเตือนสมาชิกแผนกของฝ่ายนั้นว่ามีใบงานเข้าพูล (createNotifications ตัดตัวผู้กดเองออกให้แล้ว)
// opts.title ใช้ตอน "คืนงาน" — ใบงานเดิมกลับเข้าพูล ไม่ใช่ใบงานใหม่
async function notifyPoolNewJob(
    job: { id: string; job_type: string; title: string },
    actorId: string,
    opts?: { title?: string; body?: string }
) {
    const jobType: PoolJobType = job.job_type === 'graphic' ? 'graphic' : 'onsite'
    const departments = await getPoolTeamDepartments(jobType)
    if (departments.length === 0) return

    const supabase = createServiceClient()
    const { data: members } = await supabase
        .from('profiles')
        .select('id')
        .eq('is_approved', true)
        .in('department', departments)

    await createNotifications({
        userIds: (members || []).map(m => m.id as string),
        type: 'job_pool_new',
        title: opts?.title || `ใบงานใหม่เข้าพูล: ${job.title}`,
        body: opts?.body || (jobType === 'graphic'
            ? 'ใบงานกราฟิก — กดรับงานได้จากพูลงาน'
            : 'ใบงานหน้างาน — กดรับงานได้จากพูลงาน'),
        referenceType: 'job',
        referenceId: job.id,
        actorId,
    })
}

// สร้างใบงานอัตโนมัติเมื่อการ์ด CRM เปลี่ยนเป็น "ตอบรับ" — เรียกจาก updateLeadStatus
// สร้างเฉพาะ "ใบงานหน้างาน" — ใบงานกราฟิกเปิดเองจากปุ่มบนการ์ด CRM (openGraphicJob)
// กันสร้างซ้ำรายประเภท: มีใบงานหน้างานแล้วจะข้าม (สลับสถานะ accepted → อื่น → accepted ไม่เกิดใบงานผี)
export async function autoCreateJobsFromAcceptedLead(leadId: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const result = await createLeadJobs(leadId, ['onsite'], userId)
    if ('error' in result) return { error: result.error }
    if (result.jobs.length === 0) return { success: true, created: false }

    // แจ้งเตือน "ใบงานใหม่เข้าพูล" ยิงจาก createLeadJobs แล้ว — ที่นี่เหลือแค่บันทึกว่ามาทางอัตโนมัติ
    await logActivity('AUTO_CREATE_JOBS_FROM_LEAD', { leadId, jobIds: result.jobs.map(j => j.id) })
    revalidatePath('/jobs')
    revalidatePath('/jobs/tracking')
    return { success: true, created: true }
}

// ============================================================================
// พูลงาน — รับงาน / คืนงาน / ข้ามใบงาน / เปลี่ยนคนรับ
// ============================================================================

/** สถานะแรกของใบงาน — อยู่ในพูลรอให้สมาชิกฝ่ายกดรับงาน (seed ไว้ใน job_settings) */
const AWAITING_CLAIM_STATUS = 'awaiting_claim'
/** ใบงานที่ถูกข้าม — ไม่ต้องมีแถวใน job_settings, groupPoolJobs ตัดออกจากแท็บฝ่ายให้ */
const SKIPPED_STATUS = 'skipped'
/** ใบงานที่จบแล้ว — ปลายทางของการจบอัตโนมัติ (groupPoolJobs ตัดออกจากแท็บฝ่ายเช่นกัน) */
const DONE_STATUS = 'done'
/** แผนกที่ดูแลพูลร่วมกับแอดมิน — ข้ามใบงาน/เปลี่ยนคนรับได้ และรับแจ้งเตือนความเคลื่อนไหว */
const COORDINATOR_DEPARTMENT = 'ฝ่ายประสานงาน'
/** ยังไม่มีสถานะอื่นใน job_settings เลย — สถานะหลังรับงานตกมาที่ค่านี้ */
const POOL_FALLBACK_STATUS: Record<PoolJobType, string> = { graphic: 'pending', onsite: 'preparing' }

const poolTypeOf = (jobType: string): PoolJobType => (jobType === 'graphic' ? 'graphic' : 'onsite')

/** ใบงานเท่าที่ action ในพูลต้องใช้ (client ของ supabase ไม่ผูก type ของ schema) */
type PoolJobRow = {
    id: string
    job_type: string
    status: string
    title: string
    assigned_to: string[] | null
    assigned_graphics: string[] | null
    claimed_by: string | null
}

const POOL_JOB_COLUMNS = 'id, job_type, status, title, assigned_to, assigned_graphics, claimed_by'

async function getPoolJob(jobId: string): Promise<PoolJobRow | null> {
    const supabase = createServiceClient()
    const { data } = await supabase.from('jobs').select(POOL_JOB_COLUMNS).eq('id', jobId).single()
    if (!data) return null
    return {
        id: data.id as string,
        job_type: (data.job_type as string) || '',
        status: (data.status as string) || '',
        title: (data.title as string) || 'ใบงาน',
        assigned_to: (data.assigned_to as string[]) ?? [],
        assigned_graphics: (data.assigned_graphics as string[]) ?? [],
        claimed_by: (data.claimed_by as string) ?? null,
    }
}

/** ผู้กดปุ่ม — role/department ตัดสินสิทธิ์ทั้งหมดของพูล (requireAuth ตรวจ session จริงให้แล้ว) */
type PoolActor = { userId: string; role: string; department: string | null; name: string }

async function getPoolActor(): Promise<PoolActor | null> {
    const auth = await requireAuth()
    if (!auth) return null

    const supabase = createServiceClient()
    const { data } = await supabase
        .from('profiles')
        .select('department, full_name, nickname')
        .eq('id', auth.userId)
        .single()

    return {
        userId: auth.userId,
        role: auth.role,
        department: (data?.department as string) ?? null,
        name: (data?.nickname as string) || (data?.full_name as string) || 'ผู้ใช้',
    }
}

/** แอดมินและฝ่ายประสานงานดูแลพูล: ข้ามใบงาน / เปลี่ยนคนรับ / คืนงานแทนผู้รับได้ */
const isPoolManager = (actor: PoolActor) =>
    actor.role === 'admin' || actor.department === COORDINATOR_DEPARTMENT

/** สถานะถัดจาก "รอรับงาน" — แถว is_active ที่ sort_order ต่ำสุดที่ไม่ใช่ awaiting_claim */
async function getPoolNextStatus(jobType: PoolJobType): Promise<string> {
    const supabase = createServiceClient()
    const { data } = await supabase
        .from('job_settings')
        .select('value')
        .eq('category', `status_${jobType}`)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

    const next = (data || [])
        .map(r => r.value as string)
        .find(v => v && v !== AWAITING_CLAIM_STATUS)

    return next || POOL_FALLBACK_STATUS[jobType]
}

/**
 * แจ้งเตือนแอดมิน + ฝ่ายประสานงานทุกครั้งที่พูลขยับ (or() ใช้ค่าไทยไม่ได้ จึงยิงสองคิวรี)
 * `referenceType` ปกติคือใบงาน — หน้าที่เตรียมงานผูกกับงาน (crm_lead) ไม่ใช่ใบงาน จึงส่งทับได้
 */
async function notifyPoolManagers(
    job: { id: string },
    actorId: string,
    title: string,
    body?: string,
    referenceType: 'job' | 'crm_lead' = 'job'
) {
    const supabase = createServiceClient()
    const [admins, coordinators] = await Promise.all([
        supabase.from('profiles').select('id').eq('is_approved', true).eq('role', 'admin'),
        supabase.from('profiles').select('id').eq('is_approved', true).eq('department', COORDINATOR_DEPARTMENT),
    ])

    await createNotifications({
        userIds: [...(admins.data || []), ...(coordinators.data || [])].map(m => m.id as string),
        type: 'job_status_changed',
        title,
        body,
        referenceType,
        referenceId: job.id,
        actorId,
    })
}

/** บันทึกลงไทม์ไลน์ของใบงาน (job_activities) แบบเดียวกับ updateJobStatus */
async function logPoolJobActivity(
    jobId: string,
    actorId: string,
    description: string,
    oldStatus: string,
    newStatus: string
) {
    const supabase = createServiceClient()
    await supabase.from('job_activities').insert({
        job_id: jobId,
        created_by: actorId,
        activity_type: 'status_change',
        description,
        old_status: oldStatus,
        new_status: newStatus,
    })
}

function revalidatePool(jobId: string) {
    revalidatePath('/jobs')
    revalidatePath('/jobs/tracking')
    revalidatePath(`/jobs/${jobId}`)
}

/**
 * รับงาน — สมาชิกฝ่ายกดรับใบงานจากพูลเป็นของตัวเอง
 * กราฟิก: ผู้รับเป็นเจ้าของงานออกแบบ / หน้างาน: ผู้รับเป็นหัวหน้างานผู้รับผิดชอบ
 * กันคนสองคนกดพร้อมกันด้วย conditional update (WHERE status = 'awaiting_claim')
 */
export async function claimPoolJob(jobId: string) {
    const actor = await getPoolActor()
    if (!actor) return { error: 'ไม่ได้เข้าสู่ระบบ' }

    const job = await getPoolJob(jobId)
    if (!job) return { error: 'ไม่พบใบงานนี้' }
    if (job.status !== AWAITING_CLAIM_STATUS) return { error: 'ใบงานนี้ถูกรับไปแล้ว' }

    const jobType = poolTypeOf(job.job_type)
    const departments = await getPoolTeamDepartments(jobType)
    if (!canActOnPool(actor.department, actor.role === 'admin', departments)) {
        return { error: 'เฉพาะทีมของฝ่ายนี้เท่านั้นที่รับใบงานได้' }
    }

    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {
        status: await getPoolNextStatus(jobType),
        claimed_by: actor.userId,
        claimed_at: now,
        skipped_at: null,
        skip_reason: null,
        assigned_to: [...new Set([...(job.assigned_to || []), actor.userId])],
        updated_at: now,
    }
    if (jobType === 'graphic') {
        updates.assigned_graphics = [...new Set([...(job.assigned_graphics || []), actor.userId])]
    }

    const supabase = createServiceClient()
    const { data: claimed, error } = await supabase
        .from('jobs')
        .update(updates)
        .eq('id', jobId)
        .eq('status', AWAITING_CLAIM_STATUS) // คนที่สองจะไม่เจอแถวนี้แล้ว
        .select('id')

    if (error) return { error: error.message }
    if (!claimed || claimed.length === 0) return { error: 'ใบงานนี้ถูกรับไปแล้ว' }

    const newStatus = updates.status as string
    await logPoolJobActivity(jobId, actor.userId, `รับงานโดย ${actor.name}`, job.status, newStatus)
    await logActivity('CLAIM_POOL_JOB', { jobId, jobType, newStatus })
    await notifyPoolManagers(
        job,
        actor.userId,
        `รับใบงานแล้ว: ${job.title}`,
        `${actor.name} รับ${jobType === 'graphic' ? 'ใบงานกราฟิก' : 'ใบงานหน้างาน'}นี้ไปแล้ว`
    )

    revalidatePool(jobId)
    return { success: true }
}

/** คืนงาน — ผู้รับสละใบงานกลับเข้าพูล (แอดมิน/ฝ่ายประสานงานคืนแทนได้) แล้วแจ้งทีมฝ่ายนั้นอีกครั้ง */
export async function releasePoolJob(jobId: string) {
    const actor = await getPoolActor()
    if (!actor) return { error: 'ไม่ได้เข้าสู่ระบบ' }

    const job = await getPoolJob(jobId)
    if (!job) return { error: 'ไม่พบใบงานนี้' }
    if (job.status === SKIPPED_STATUS) return { error: 'ใบงานนี้ถูกข้ามไปแล้ว' }
    if (job.status === AWAITING_CLAIM_STATUS) return { error: 'ใบงานนี้อยู่ในพูลอยู่แล้ว' }
    if (job.claimed_by !== actor.userId && !isPoolManager(actor)) {
        return { error: 'คืนงานได้เฉพาะผู้รับใบงานเท่านั้น' }
    }

    const jobType = poolTypeOf(job.job_type)
    const formerClaimer = job.claimed_by
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {
        status: AWAITING_CLAIM_STATUS,
        claimed_by: null,
        claimed_at: null,
        assigned_to: (job.assigned_to || []).filter(id => id !== formerClaimer),
        updated_at: now,
    }
    if (jobType === 'graphic') {
        updates.assigned_graphics = (job.assigned_graphics || []).filter(id => id !== formerClaimer)
    }

    const supabase = createServiceClient()
    const { error } = await supabase.from('jobs').update(updates).eq('id', jobId)
    if (error) return { error: error.message }

    await logPoolJobActivity(jobId, actor.userId, `คืนงานเข้าพูลโดย ${actor.name}`, job.status, AWAITING_CLAIM_STATUS)
    await logActivity('RELEASE_POOL_JOB', { jobId, jobType, formerClaimer })

    // ทีมของฝ่ายนั้นต้องรู้ว่ามีใบงานว่างกลับเข้าพูล + แอดมิน/ประสานงานเห็นความเคลื่อนไหว
    await notifyPoolNewJob(job, actor.userId, {
        title: `ใบงานกลับเข้าพูล: ${job.title}`,
        body: `${actor.name} คืนงาน — กดรับงานได้จากพูลงาน`,
    })
    await notifyPoolManagers(job, actor.userId, `ใบงานกลับเข้าพูล: ${job.title}`, `${actor.name} คืนงานแล้ว`)

    revalidatePool(jobId)
    return { success: true }
}

/** ข้ามใบงาน — แอดมิน/ฝ่ายประสานงานประกาศว่างานนี้ไม่มีงานของฝ่ายนั้น ใบงานออกจากพูลโดยไม่มีผู้รับ */
export async function skipPoolJob(jobId: string, reason: string) {
    const actor = await getPoolActor()
    if (!actor) return { error: 'ไม่ได้เข้าสู่ระบบ' }
    if (!isPoolManager(actor)) return { error: 'เฉพาะแอดมินหรือฝ่ายประสานงานเท่านั้นที่ข้ามใบงานได้' }

    const trimmed = (reason || '').trim()
    if (!trimmed) return { error: 'กรุณาระบุเหตุผลที่ข้ามใบงาน' }

    const job = await getPoolJob(jobId)
    if (!job) return { error: 'ไม่พบใบงานนี้' }
    if (job.status === SKIPPED_STATUS) return { error: 'ใบงานนี้ถูกข้ามไปแล้ว' }

    const jobType = poolTypeOf(job.job_type)
    const formerClaimer = job.claimed_by
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {
        status: SKIPPED_STATUS,
        skipped_at: now,
        skip_reason: trimmed,
        claimed_by: null,
        claimed_at: null,
        assigned_to: (job.assigned_to || []).filter(id => id !== formerClaimer),
        updated_at: now,
    }
    if (jobType === 'graphic') {
        updates.assigned_graphics = (job.assigned_graphics || []).filter(id => id !== formerClaimer)
    }

    const supabase = createServiceClient()
    const { error } = await supabase.from('jobs').update(updates).eq('id', jobId)
    if (error) return { error: error.message }

    await logPoolJobActivity(jobId, actor.userId, `ข้ามใบงาน: ${trimmed}`, job.status, SKIPPED_STATUS)
    await logActivity('SKIP_POOL_JOB', { jobId, jobType, reason: trimmed })

    const recipients = formerClaimer ? [formerClaimer] : []
    if (recipients.length > 0) {
        await createNotifications({
            userIds: recipients,
            type: 'job_status_changed',
            title: `ใบงานถูกข้าม: ${job.title}`,
            body: `เหตุผล: ${trimmed}`,
            referenceType: 'job',
            referenceId: job.id,
            actorId: actor.userId,
        })
    }
    await notifyPoolManagers(job, actor.userId, `ใบงานถูกข้าม: ${job.title}`, `${actor.name} ข้ามใบงาน — เหตุผล: ${trimmed}`)

    revalidatePool(jobId)
    return { success: true }
}

/** เปลี่ยนคนรับ — แอดมิน/ฝ่ายประสานงานย้ายใบงานที่มีผู้รับแล้วไปให้อีกคน (สถานะคงเดิม) */
export async function reassignPoolJob(jobId: string, newUserId: string) {
    const actor = await getPoolActor()
    if (!actor) return { error: 'ไม่ได้เข้าสู่ระบบ' }
    if (!isPoolManager(actor)) return { error: 'เฉพาะแอดมินหรือฝ่ายประสานงานเท่านั้นที่เปลี่ยนคนรับได้' }
    if (!newUserId) return { error: 'กรุณาเลือกผู้รับใบงานคนใหม่' }

    const job = await getPoolJob(jobId)
    if (!job) return { error: 'ไม่พบใบงานนี้' }
    if (job.status === SKIPPED_STATUS) return { error: 'ใบงานนี้ถูกข้ามไปแล้ว' }
    if (!job.claimed_by) return { error: 'ใบงานนี้ยังไม่มีผู้รับ — ต้องมีคนกดรับงานก่อน' }
    if (job.claimed_by === newUserId) return { error: 'ผู้รับคนนี้รับใบงานนี้อยู่แล้ว' }

    const supabase = createServiceClient()
    const { data: newUser } = await supabase
        .from('profiles')
        .select('id, full_name, nickname, is_approved')
        .eq('id', newUserId)
        .single()
    if (!newUser || !newUser.is_approved) return { error: 'ไม่พบผู้ใช้ที่เลือก' }

    const newUserName = (newUser.nickname as string) || (newUser.full_name as string) || 'ผู้ใช้'
    const jobType = poolTypeOf(job.job_type)
    const formerClaimer = job.claimed_by
    const now = new Date().toISOString()
    const syncList = (list: string[] | null) => [
        ...new Set([...(list || []).filter(id => id !== formerClaimer), newUserId]),
    ]
    const updates: Record<string, unknown> = {
        claimed_by: newUserId,
        claimed_at: now,
        assigned_to: syncList(job.assigned_to),
        updated_at: now,
    }
    if (jobType === 'graphic') updates.assigned_graphics = syncList(job.assigned_graphics)

    const { error } = await supabase.from('jobs').update(updates).eq('id', jobId)
    if (error) return { error: error.message }

    await logPoolJobActivity(
        jobId,
        actor.userId,
        `เปลี่ยนคนรับใบงานเป็น ${newUserName}`,
        job.status,
        job.status
    )
    await logActivity('REASSIGN_POOL_JOB', { jobId, jobType, formerClaimer, newUserId })

    await createNotifications({
        userIds: [newUserId, formerClaimer].filter(Boolean) as string[],
        type: 'job_assigned',
        title: `เปลี่ยนคนรับใบงาน: ${job.title}`,
        body: `ผู้รับใบงานคนใหม่คือ ${newUserName}`,
        referenceType: 'job',
        referenceId: job.id,
        actorId: actor.userId,
    })
    await notifyPoolManagers(
        job,
        actor.userId,
        `เปลี่ยนคนรับใบงาน: ${job.title}`,
        `${actor.name} เปลี่ยนผู้รับเป็น ${newUserName}`
    )

    revalidatePool(jobId)
    return { success: true }
}

// ============================================================================
// หน้าที่เตรียมงาน (Prep duty) — รับ/คืนรายหน้าที่ จัดคน / จัดรถ / จัดกระเป๋า
// ดู CONTEXT.md § "หน้าที่เตรียมงาน": สามหน้าที่รับ-คืนแยกกันอิสระ ไม่บังคับลำดับ
// แผนกที่รับได้ตั้งค่าได้รายหน้าที่ (job_settings) — แอดมินรับแทนได้ทุกหน้าที่
// ============================================================================

/** ชื่อของงานสำหรับใส่ในหัวข้อแจ้งเตือน — งานที่หาไม่เจอ = null (action จะตอบ error) */
async function getDutyLeadName(leadId: string): Promise<string | null> {
    const supabase = createServiceClient()
    const { data } = await supabase.from('crm_leads').select('customer_name').eq('id', leadId).single()
    if (!data) return null
    return (data.customer_name as string) || 'ไม่ระบุลูกค้า'
}

/** แผนกที่รับหน้าที่นี้ได้ — ยังไม่ตั้งค่า = ค่าเริ่มต้นของหมวดนั้น */
async function getDutyDepartments(duty: PrepDuty): Promise<string[]> {
    const category = PREP_DUTY_CATEGORY[duty]
    return getDepartmentSetting(category, [...POOL_TEAM_DEFAULTS[category]])
}

/**
 * รับหน้าที่เตรียมงาน — คนในแผนกที่ตั้งไว้ของหน้าที่นั้น (หรือแอดมิน) กดรับได้
 * กันสองคนกดพร้อมกันด้วย UNIQUE (lead_id, duty) ใน lead_duty_claims:
 * INSERT ที่ช้ากว่าได้ error 23505 แล้วแปลงเป็นข้อความไทย (ไม่ต้องเช็คก่อนแล้วค่อยเขียน)
 */
export async function claimLeadDuty(leadId: string, duty: string) {
    const actor = await getPoolActor()
    if (!actor) return { error: 'ไม่ได้เข้าสู่ระบบ' }
    if (!isPrepDuty(duty)) return { error: 'หน้าที่ไม่ถูกต้อง' }

    const departments = await getDutyDepartments(duty)
    if (!canActOnPool(actor.department, actor.role === 'admin', departments)) {
        return { error: 'เฉพาะทีมที่รับผิดชอบหน้าที่นี้เท่านั้นที่รับได้' }
    }

    const leadName = await getDutyLeadName(leadId)
    if (!leadName) return { error: 'ไม่พบงานนี้' }

    const supabase = createServiceClient()
    const { error } = await supabase.from('lead_duty_claims').insert({
        lead_id: leadId,
        duty,
        claimed_by: actor.userId,
    })
    if (error) {
        // 23505 = unique_violation — มีคนกดรับหน้าที่นี้ไปก่อนแล้ว (คนที่สองของการกดพร้อมกัน)
        if ((error as { code?: string }).code === '23505') return { error: 'หน้าที่นี้มีคนรับไปแล้ว' }
        return { error: error.message }
    }

    const label = DUTY_LABELS_TH[duty]
    await logActivity('CLAIM_LEAD_DUTY', { leadId, duty })
    await notifyPoolManagers(
        { id: leadId },
        actor.userId,
        `รับหน้าที่${label}: ${leadName}`,
        `${actor.name} รับหน้าที่${label}ของงานนี้แล้ว`,
        'crm_lead'
    )

    revalidatePath('/jobs/tracking')
    return { success: true }
}

/** คืนหน้าที่เตรียมงาน — ผู้รับเองหรือแอดมิน/ฝ่ายประสานงาน คืนแล้วหน้าที่กลับเป็นรอรับงาน */
export async function releaseLeadDuty(leadId: string, duty: string) {
    const actor = await getPoolActor()
    if (!actor) return { error: 'ไม่ได้เข้าสู่ระบบ' }
    if (!isPrepDuty(duty)) return { error: 'หน้าที่ไม่ถูกต้อง' }

    const supabase = createServiceClient()
    const { data: claim } = await supabase
        .from('lead_duty_claims')
        .select('id, claimed_by')
        .eq('lead_id', leadId)
        .eq('duty', duty)
        .single()

    if (!claim) return { error: 'หน้าที่นี้ยังไม่มีผู้รับ' }
    if ((claim.claimed_by as string) !== actor.userId && !isPoolManager(actor)) {
        return { error: 'คืนหน้าที่ได้เฉพาะผู้รับหน้าที่นี้เท่านั้น' }
    }

    const { error } = await supabase.from('lead_duty_claims').delete().eq('id', claim.id as string)
    if (error) return { error: error.message }

    const label = DUTY_LABELS_TH[duty]
    const leadName = (await getDutyLeadName(leadId)) || 'ไม่ระบุลูกค้า'
    await logActivity('RELEASE_LEAD_DUTY', { leadId, duty, formerClaimer: claim.claimed_by })
    await notifyPoolManagers(
        { id: leadId },
        actor.userId,
        `คืนหน้าที่${label}: ${leadName}`,
        `${actor.name} คืนหน้าที่${label} — กลับเป็นรอรับงาน`,
        'crm_lead'
    )

    revalidatePath('/jobs/tracking')
    return { success: true }
}

/**
 * ใบงานกราฟิกของงานนี้จบเอง เมื่อสถานะออกแบบถึงขั้นพร้อม (sent_email_cf / completed)
 * — ไม่คืน error: การบันทึกสถานะออกแบบต้องสำเร็จอยู่ดีแม้ใบงานจะอัปเดตพลาด (บันทึกไว้ใน console)
 * — ถ้าสถานะออกแบบถอยกลับออกจากขั้นพร้อม (เช่น "แก้ไข") จงใจไม่ปลุกใบงานที่จบไปแล้วกลับเข้าพูล
 *   ให้แอดมิน/ฝ่ายประสานงานตัดสินใจเองว่าจะเปิดใบงานใหม่หรือแก้สถานะใบงานด้วยมือ
 */
async function autoFinishGraphicJobs(leadId: string, designStatus: string, actorId: string) {
    if (!READY_DESIGN_STATUSES.includes(designStatus)) return

    const supabase = createServiceClient()
    const { data: jobs, error } = await supabase
        .from('jobs')
        .select('id, status')
        .eq('crm_lead_id', leadId)
        .eq('job_type', 'graphic')

    if (error) {
        console.error('[jobs] auto-finish graphic: fetch failed:', error.message)
        return
    }

    for (const job of jobs || []) {
        const oldStatus = (job.status as string) || ''
        if (!shouldFinishGraphicJob(designStatus, oldStatus)) continue

        const { error: updErr } = await supabase
            .from('jobs')
            .update({ status: DONE_STATUS, updated_at: new Date().toISOString() })
            .eq('id', job.id)
        if (updErr) {
            console.error('[jobs] auto-finish graphic: update failed:', updErr.message)
            continue
        }

        await logPoolJobActivity(job.id as string, actorId, 'จบอัตโนมัติ: ออกแบบเสร็จ', oldStatus, DONE_STATUS)
        await logActivity('AUTO_FINISH_POOL_JOB', {
            jobId: job.id,
            jobType: 'graphic',
            leadId,
            designStatus,
            oldStatus,
        })
        revalidatePool(job.id as string)
    }
}

/**
 * เขียน cache ระดับงาน (crm_leads.design_status) ให้ตรงกับใบงานกราฟิกของงานนั้น
 * — สถานะจริงอยู่รายใบ (jobs.design_status) คอลัมน์เดิมคงไว้ให้โค้ด/รายงานที่ยังอ่านระดับงาน
 * — ยึด "ใบแรกที่ยังไม่จบ" (เรียงตามวันที่สร้าง) ถ้าจบหมดแล้วใช้ใบล่าสุด
 * — ไม่คืน error: การบันทึกสถานะของใบต้องสำเร็จอยู่ดีแม้ cache จะเขียนพลาด (บันทึกไว้ใน console)
 */
async function syncLeadDesignCache(leadId: string) {
    const supabase = createServiceClient()
    const { data: rows, error } = await supabase
        .from('jobs')
        .select('id, status, design_status')
        .eq('crm_lead_id', leadId)
        .eq('job_type', 'graphic')
        .is('archived_at', null)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('[jobs] sync lead design cache: fetch failed:', error.message)
        return
    }
    const jobs = rows || []
    if (jobs.length === 0) return

    const isActive = (status: string) => status !== DONE_STATUS && status !== SKIPPED_STATUS
    const primary = jobs.find(j => isActive((j.status as string) || '')) ?? jobs[jobs.length - 1]
    const value = (primary.design_status as string) || null
    if (!value) return

    const { error: updErr } = await supabase
        .from('crm_leads')
        .update({ design_status: value })
        .eq('id', leadId)
    if (updErr) console.error('[jobs] sync lead design cache: update failed:', updErr.message)
}

/**
 * แก้สถานะออกแบบของ "ใบงานกราฟิกใบเดียว" — งานหนึ่งเปิดได้หลายใบ แต่ละใบเดินสถานะของตัวเอง
 * ถึงขั้นพร้อม (sent_email_cf / completed) → จบเฉพาะใบนี้ ใบอื่นของงานเดียวกันไม่ถูกแตะ
 * จากนั้น sync cache ระดับงานให้ตารางภาพรวม/รายงานเดิมยังเห็นค่าที่ถูก
 */
export async function updateJobDesignStatus(jobId: string, designStatus: string) {
    const auth = await requireAuth()
    if (!auth) return { error: 'ไม่ได้เข้าสู่ระบบ' }
    if (!DESIGN_STATUS_VALUES.includes(designStatus)) return { error: 'สถานะออกแบบไม่ถูกต้อง' }

    const supabase = createServiceClient()
    const { data: job } = await supabase
        .from('jobs')
        .select('id, job_type, status, design_status, crm_lead_id')
        .eq('id', jobId)
        .single()

    if (!job) return { error: 'ไม่พบใบงานนี้' }
    if ((job.job_type as string) !== 'graphic') return { error: 'ใบงานนี้ไม่ใช่ใบงานกราฟิก' }

    const oldStatus = (job.status as string) || ''
    const leadId = (job.crm_lead_id as string) ?? null
    // ใบที่ยังทำอยู่และออกแบบถึงขั้นพร้อม → จบเฉพาะใบนี้ (ใบที่จบ/ถูกข้ามไปแล้วไม่แตะซ้ำ)
    const finish = shouldFinishGraphicJob(designStatus, oldStatus)

    const update: Record<string, unknown> = {
        design_status: designStatus,
        updated_at: new Date().toISOString(),
    }
    if (finish) update.status = DONE_STATUS

    const { error } = await supabase.from('jobs').update(update).eq('id', jobId)
    if (error) return { error: error.message }

    await logActivity('UPDATE_JOB_DESIGN_STATUS', {
        jobId,
        leadId,
        designStatus,
        previous: (job.design_status as string) ?? null,
    })

    if (finish) {
        await logPoolJobActivity(jobId, auth.userId, 'จบอัตโนมัติ: ออกแบบเสร็จ', oldStatus, DONE_STATUS)
        await logActivity('AUTO_FINISH_POOL_JOB', {
            jobId,
            jobType: 'graphic',
            leadId,
            designStatus,
            oldStatus,
        })
    }

    if (leadId) {
        try {
            await syncLeadDesignCache(leadId)
        } catch (e) {
            console.error('[jobs] sync lead design cache threw:', e)
        }
    }

    revalidatePool(jobId)
    return { success: true, finished: finish }
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

    // Staff for this lead = the UNION of every linked event's staff. Staff is managed
    // per event now (event_staff keyed by event_id), so we aggregate across the lead's
    // events and de-dupe by user+role for this flat list.
    const { data: leadEvents } = await supabase
        .from('events')
        .select('id')
        .eq('crm_lead_id', leadId)
    const leadEventIds = (leadEvents || []).map((e: { id: string }) => e.id)

    let leadStaffRows: any[] = []
    if (leadEventIds.length > 0) {
        const { data } = await supabase
            .from('event_staff')
            .select('user_id, role, profiles:user_id(full_name)')
            .in('event_id', leadEventIds)
            .order('created_at', { ascending: true })
        leadStaffRows = data || []
    }

    const seenStaff = new Set<string>()
    const leadStaff = leadStaffRows
        .map((s: any) => ({
            user_id: s.user_id,
            full_name: s.profiles?.full_name || '',
            role: s.role,
        }))
        .filter((s: { user_id: string; role: string }) => {
            const key = `${s.user_id}::${s.role}`
            if (seenStaff.has(key)) return false
            seenStaff.add(key)
            return true
        })

    return {
        lead,
        installments: installments || [],
        crmSettings: crmSettings || [],
        leadStaff,
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

    // Fetch ticket for notification
    const { data: ticket } = await supabase.from('tickets').select('status, subject, assigned_to, created_by').eq('id', id).single()
    const oldStatus = ticket?.status || 'unknown'

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

    // Notify ticket creator + assigned users about status change
    if (ticket) {
        const recipients = [...(ticket.assigned_to || []), ticket.created_by].filter(Boolean) as string[]
        await createNotifications({
            userIds: recipients,
            type: 'ticket_status_changed',
            title: `Ticket "${ticket.subject || 'ไม่ระบุ'}" เปลี่ยนสถานะ: ${oldStatus} → ${newStatus}`,
            referenceType: 'ticket',
            referenceId: id,
            actorId: userId,
        })
    }

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
    const { data: ticket } = await supabase.from('tickets').select('status, subject, assigned_to, created_by').eq('id', ticketId).single()
    if (ticket && ticket.status === 'open' && ticket.created_by !== userId) {
        await supabase.from('tickets').update({
            status: 'answered',
            updated_at: new Date().toISOString(),
        }).eq('id', ticketId)
    }

    await supabase.from('tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId)

    await logActivity('CREATE_TICKET_REPLY', { ticketId, reply_type: reply.reply_type })

    // Notify ticket participants + mentioned users (mentioned get a distinct
    // type so the "ถูกแท็ก" tab can list tickets the user was @'d in)
    if (ticket) {
        const mentionedUsers = (formData.get('notify_users') as string || '').split(',').filter(Boolean)
        const recipients = ([...(ticket.assigned_to || []), ticket.created_by].filter(Boolean) as string[])
            .filter(id => !mentionedUsers.includes(id))
        if (mentionedUsers.length > 0) {
            await createNotifications({
                userIds: mentionedUsers,
                type: 'ticket_mentioned',
                title: `คุณถูกแท็กใน Ticket: ${ticket.subject || 'ไม่ระบุ'}`,
                body: (reply.content || '').substring(0, 200),
                referenceType: 'ticket',
                referenceId: ticketId,
                actorId: userId,
            })
        }
        await createNotifications({
            userIds: recipients,
            type: 'ticket_reply',
            title: `มีตอบกลับใหม่ใน Ticket: ${ticket.subject || 'ไม่ระบุ'}`,
            body: (reply.content || '').substring(0, 200),
            referenceType: 'ticket',
            referenceId: ticketId,
            actorId: userId,
        })
    }

    revalidatePath('/jobs')
    revalidatePath(`/jobs/tickets/${ticketId}`)
    return { success: true }
}

/** Ticket ids ที่ user ปัจจุบันเคยถูก @ (จาก notification type 'ticket_mentioned') */
export async function getMentionedTicketIds(): Promise<string[]> {
    const { userId } = await getSession()
    if (!userId) return []

    const supabase = createServiceClient()
    const { data } = await supabase
        .from('notifications')
        .select('reference_id')
        .eq('user_id', userId)
        .eq('type', 'ticket_mentioned')
        .eq('reference_type', 'ticket')

    return [...new Set((data || []).map(r => r.reference_id as string))]
}

export async function deleteTicket(id: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    // เก็บ attachment ของ ticket + replies (ที่จะถูก cascade ลบ) ไว้ลบไฟล์ตาม
    const { data: ticket } = await supabase.from('tickets').select('attachments').eq('id', id).single()
    const { data: replies } = await supabase.from('ticket_replies').select('attachments').eq('ticket_id', id)

    const { error } = await supabase.from('tickets').delete().eq('id', id)
    if (error) return { error: error.message }

    await removeStorageByUrls(supabase, 'ticket-attachments', [
        ...(ticket?.attachments || []),
        ...(replies || []).flatMap(r => r.attachments || []),
    ])

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

// ============================================================================
// Ticket Report — Aggregated Data
// ============================================================================

export interface TicketReportData {
    totalTickets: number
    openCount: number
    closedCount: number
    archivedCount: number
    avgResolutionHours: number | null
    byCategory: { category: string; count: number }[]
    closedByCategory: { category: string; total: number; closed: number }[]
    byStatus: { status: string; count: number }[]
    byPriority: { priority: string; count: number }[]
    monthlyTrend: { month: string; count: number }[]
    recentClosed: Ticket[]
    topCreators: { name: string; userId: string; total: number; categories: { category: string; count: number }[] }[]
}

export async function getTicketReportData(): Promise<TicketReportData> {
    const supabase = createServiceClient()

    // Fetch ALL tickets (including archived)
    const { data: allTickets } = await supabase
        .from('tickets')
        .select('*, profiles:created_by(full_name)')
        .order('created_at', { ascending: false })

    const tickets = (allTickets || []) as Ticket[]

    const totalTickets = tickets.length
    const openCount = tickets.filter(t => t.status === 'open' && !t.archived_at).length
    const closedCount = tickets.filter(t => t.status === 'closed' || t.closed_at).length
    const archivedCount = tickets.filter(t => t.archived_at).length

    // Average resolution time (for closed tickets with both created_at and closed_at)
    const closedWithTime = tickets.filter(t => t.closed_at && t.created_at)
    let avgResolutionHours: number | null = null
    if (closedWithTime.length > 0) {
        const totalHours = closedWithTime.reduce((sum, t) => {
            const created = new Date(t.created_at).getTime()
            const closed = new Date(t.closed_at!).getTime()
            return sum + (closed - created) / (1000 * 60 * 60)
        }, 0)
        avgResolutionHours = Math.round((totalHours / closedWithTime.length) * 10) / 10
    }

    // By Category
    const categoryMap = new Map<string, number>()
    tickets.forEach(t => {
        categoryMap.set(t.category, (categoryMap.get(t.category) || 0) + 1)
    })
    const byCategory = Array.from(categoryMap.entries()).map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)

    // By Status
    const statusMap = new Map<string, number>()
    tickets.forEach(t => {
        statusMap.set(t.status, (statusMap.get(t.status) || 0) + 1)
    })
    const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }))

    // By Priority
    const priorityMap = new Map<string, number>()
    tickets.forEach(t => {
        priorityMap.set(t.priority, (priorityMap.get(t.priority) || 0) + 1)
    })
    const byPriority = Array.from(priorityMap.entries()).map(([priority, count]) => ({ priority, count }))

    // Monthly Trend (last 6 months)
    const now = new Date()
    const monthlyTrend: { month: string; count: number }[] = []
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const monthLabel = d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
        const count = tickets.filter(t => {
            const created = new Date(t.created_at)
            return created.getFullYear() === d.getFullYear() && created.getMonth() === d.getMonth()
        }).length
        monthlyTrend.push({ month: monthLabel, count })
    }

    // Closed by Category
    const closedByCategory = byCategory.map(bc => {
        const closed = tickets.filter(t => t.category === bc.category && (t.status === 'closed' || t.closed_at)).length
        return { category: bc.category, total: bc.count, closed }
    })

    // Top Creators — who opened the most tickets + by which category
    const creatorMap = new Map<string, { name: string; userId: string; total: number; catMap: Map<string, number> }>()
    tickets.forEach(t => {
        const uid = t.created_by || 'unknown'
        const name = t.profiles?.full_name || 'ไม่ระบุ'
        if (!creatorMap.has(uid)) {
            creatorMap.set(uid, { name, userId: uid, total: 0, catMap: new Map() })
        }
        const entry = creatorMap.get(uid)!
        entry.total++
        entry.catMap.set(t.category, (entry.catMap.get(t.category) || 0) + 1)
    })
    const topCreators = Array.from(creatorMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
        .map(c => ({
            name: c.name,
            userId: c.userId,
            total: c.total,
            categories: Array.from(c.catMap.entries())
                .map(([category, count]) => ({ category, count }))
                .sort((a, b) => b.count - a.count),
        }))

    // Recent Closed
    const recentClosed = tickets
        .filter(t => t.status === 'closed' || t.closed_at)
        .slice(0, 10)

    return {
        totalTickets,
        openCount,
        closedCount,
        archivedCount,
        avgResolutionHours,
        byCategory,
        closedByCategory,
        byStatus,
        byPriority,
        monthlyTrend,
        recentClosed,
        topCreators,
    }
}

// ============================================================================
// Ticket Attachments — File Upload/Delete
// ============================================================================

const ALLOWED_MIME_TYPES = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    // Documents
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    // Archives
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
]

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export async function uploadTicketAttachments(formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized', urls: [] }

    const supabase = createServiceClient()
    const files = formData.getAll('files') as File[]
    const folder = (formData.get('folder') as string) || 'general'

    if (!files.length) return { error: 'No files provided', urls: [] }

    const urls: string[] = []
    const errors: string[] = []

    for (const file of files) {
        // Validate type
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            errors.push(`${file.name}: ไม่รองรับประเภทไฟล์นี้`)
            continue
        }
        // Validate size
        if (file.size > MAX_FILE_SIZE) {
            errors.push(`${file.name}: ไฟล์เกิน 50MB`)
            continue
        }

        const ext = file.name.split('.').pop() || 'bin'
        const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
        const path = `${folder}/${uniqueName}`

        const buffer = Buffer.from(await file.arrayBuffer())
        const { error: uploadError } = await supabase.storage
            .from('ticket-attachments')
            .upload(path, buffer, { contentType: file.type, upsert: false })

        if (uploadError) {
            errors.push(`${file.name}: ${uploadError.message}`)
            continue
        }

        const { data: publicUrlData } = supabase.storage
            .from('ticket-attachments')
            .getPublicUrl(path)

        urls.push(publicUrlData.publicUrl)
    }

    if (errors.length && !urls.length) return { error: errors.join(', '), urls: [] }
    return { success: true, urls, errors: errors.length ? errors : undefined }
}

export async function deleteTicketAttachment(url: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    // Extract path from public URL
    const bucketSegment = '/ticket-attachments/'
    const idx = url.indexOf(bucketSegment)
    if (idx === -1) return { error: 'Invalid URL' }
    const path = url.slice(idx + bucketSegment.length)

    const { error } = await supabase.storage
        .from('ticket-attachments')
        .remove([path])

    if (error) return { error: error.message }
    return { success: true }
}

// ============================================================================
// Ticket Reactions — Emoji Reactions (Discord-style)
// ============================================================================

export interface TicketReaction {
    id: string
    ticket_id: string
    reply_id: string | null
    user_id: string
    emoji: string
    created_at: string
    profiles?: { full_name: string | null } | null
}

export async function getTicketReactions(ticketId: string) {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('ticket_reactions')
        .select('*, profiles:user_id(full_name)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })

    if (error) return { error: error.message, data: [] }
    return { data: (data || []) as TicketReaction[] }
}

export async function toggleTicketReaction(
    ticketId: string,
    emoji: string,
    replyId?: string | null,
) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    // Check if reaction already exists
    let query = supabase
        .from('ticket_reactions')
        .select('id')
        .eq('ticket_id', ticketId)
        .eq('user_id', userId)
        .eq('emoji', emoji)

    if (replyId) {
        query = query.eq('reply_id', replyId)
    } else {
        query = query.is('reply_id', null)
    }

    const { data: existing } = await query.maybeSingle()

    if (existing) {
        // Remove reaction
        const { error } = await supabase
            .from('ticket_reactions')
            .delete()
            .eq('id', existing.id)
        if (error) return { error: error.message }
    } else {
        // Add reaction
        const { error } = await supabase
            .from('ticket_reactions')
            .insert({
                ticket_id: ticketId,
                reply_id: replyId || null,
                user_id: userId,
                emoji,
            })
        if (error) return { error: error.message }
    }

    revalidatePath(`/jobs/tickets/${ticketId}`)
    return { success: true, action: existing ? 'removed' : 'added' }
}

export async function getTicketEmojis() {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('job_settings')
        .select('*')
        .eq('category', 'ticket_emoji')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

    if (error) return { data: [], error: error.message }
    return { data: data || [] }
}

// ============================================================================
// Custom Emojis — User-uploaded custom emoji images (Discord/Slack style)
// ============================================================================

export interface CustomEmoji {
    id: string
    name: string
    shortcode: string
    image_url: string
    created_by: string | null
    is_active: boolean
    sort_order: number
    created_at: string
}

export async function getCustomEmojis() {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('custom_emojis')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

    if (error) return { data: [] as CustomEmoji[], error: error.message }
    return { data: (data || []) as CustomEmoji[] }
}

export async function getAllCustomEmojis() {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('custom_emojis')
        .select('*')
        .order('sort_order', { ascending: true })

    if (error) return { data: [] as CustomEmoji[], error: error.message }
    return { data: (data || []) as CustomEmoji[] }
}

export async function uploadCustomEmoji(formData: FormData) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const file = formData.get('file') as File
    const name = (formData.get('name') as string || '').trim()

    if (!file || !name) return { error: 'กรุณาระบุชื่อและไฟล์รูป' }

    // Validate file type
    const allowedTypes = ['image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
        return { error: 'รองรับเฉพาะไฟล์ PNG, GIF, WebP, SVG' }
    }

    // Validate file size (512KB max)
    if (file.size > 512 * 1024) {
        return { error: 'ไฟล์ต้องไม่เกิน 512KB' }
    }

    // Generate shortcode from name
    const shortcode = `:${name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}:`

    // Check duplicate shortcode
    const { data: existing } = await supabase
        .from('custom_emojis')
        .select('id')
        .eq('shortcode', shortcode)
        .maybeSingle()

    if (existing) {
        return { error: `Shortcode ${shortcode} มีอยู่แล้ว` }
    }

    // Upload to storage
    const ext = file.name.split('.').pop() || 'png'
    const filePath = `${Date.now()}_${name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
        .from('custom-emojis')
        .upload(filePath, buffer, { contentType: file.type, upsert: false })

    if (uploadError) return { error: `Upload failed: ${uploadError.message}` }

    // Get public URL
    const { data: urlData } = supabase.storage
        .from('custom-emojis')
        .getPublicUrl(filePath)

    // Get current count for sort_order
    const { count } = await supabase
        .from('custom_emojis')
        .select('*', { count: 'exact', head: true })

    // Insert into DB
    const { error: dbError } = await supabase.from('custom_emojis').insert({
        name,
        shortcode,
        image_url: urlData.publicUrl,
        created_by: userId,
        sort_order: (count || 0) + 1,
    })

    if (dbError) {
        // Cleanup uploaded file on DB error
        await supabase.storage.from('custom-emojis').remove([filePath])
        return { error: `DB error: ${dbError.message}` }
    }

    revalidatePath('/jobs/settings')
    revalidatePath('/jobs')
    return { success: true }
}

export async function deleteCustomEmoji(id: string) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    // Get the emoji to find storage path
    const { data: emoji } = await supabase
        .from('custom_emojis')
        .select('image_url')
        .eq('id', id)
        .single()

    if (emoji?.image_url) {
        // Extract path from public URL
        const bucketSegment = '/custom-emojis/'
        const idx = emoji.image_url.indexOf(bucketSegment)
        if (idx !== -1) {
            const path = emoji.image_url.slice(idx + bucketSegment.length)
            await supabase.storage.from('custom-emojis').remove([path])
        }
    }

    const { error } = await supabase.from('custom_emojis').delete().eq('id', id)
    if (error) return { error: error.message }

    revalidatePath('/jobs/settings')
    revalidatePath('/jobs')
    return { success: true }
}

export async function toggleCustomEmoji(id: string, isActive: boolean) {
    const { userId } = await getSession()
    if (!userId) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { error } = await supabase
        .from('custom_emojis')
        .update({ is_active: isActive })
        .eq('id', id)

    if (error) return { error: error.message }
    revalidatePath('/jobs/settings')
    revalidatePath('/jobs')
    return { success: true }
}

// ============================================================================
// CRM Lead Tracking (/jobs/tracking)
// ============================================================================

const CHECKLIST_KEYS = ['car_triton', 'car_champ'] // keep in sync with VEHICLES in tracking/tracking-logic.ts

export async function updateLeadTracking(
    leadId: string,
    patch: {
        design_status?: string
        supplier_note?: string | null
        tracking_checklist?: string[]
        required_roles?: Record<string, number>
    }
) {
    const session = await requireAuth()
    if (!session) return { error: 'Unauthorized' }

    const supabase = createServiceClient()
    const update: Record<string, unknown> = {}

    // compat: สถานะออกแบบย้ายไปอยู่รายใบงานแล้ว (updateJobDesignStatus) — UI ไม่เรียกทางนี้อีก
    // คงไว้ให้สคริปต์/ผู้เรียกเดิมที่ยังตั้งค่าระดับงาน พฤติกรรมเดิมทุกอย่างรวมถึงจบใบงานกราฟิกทั้งงาน
    if (patch.design_status !== undefined) {
        if (!DESIGN_STATUS_VALUES.includes(patch.design_status)) return { error: 'สถานะออกแบบไม่ถูกต้อง' }
        update.design_status = patch.design_status
    }
    if (patch.supplier_note !== undefined) {
        update.supplier_note = patch.supplier_note?.trim() || null
    }
    if (patch.tracking_checklist !== undefined) {
        if (patch.tracking_checklist.some(k => !CHECKLIST_KEYS.includes(k))) return { error: 'รายการจัดรถไม่ถูกต้อง' }
        update.tracking_checklist = Array.from(new Set(patch.tracking_checklist))
    }
    if (patch.required_roles !== undefined) {
        // ponytail: validation duplicated with crm/actions.ts::updateLead; extract when a third caller appears
        const { data: roleRows } = await supabase
            .from('crm_settings').select('value').eq('category', 'staff_role').eq('is_active', true)
        const validRoles = new Set((roleRows || []).map(r => r.value as string))
        const clean: Record<string, number> = {}
        for (const [role, count] of Object.entries(patch.required_roles)) {
            if (count === 0) continue
            if (!validRoles.has(role) || !Number.isInteger(count) || count < 1 || count > 20) {
                return { error: `ตำแหน่งที่ต้องการไม่ถูกต้อง: ${role}` }
            }
            clean[role] = count
        }
        update.required_roles = clean
    }
    if (Object.keys(update).length === 0) return { success: true }

    const { error } = await supabase.from('crm_leads').update(update).eq('id', leadId)
    if (error) return { error: error.message }

    await logActivity('UPDATE_LEAD_TRACKING', { lead_id: leadId, ...update })

    // ออกแบบถึงขั้นพร้อมแล้ว → ใบงานกราฟิกของงานนี้จบเองและหายจากแท็บกราฟิก
    // จงใจไม่ให้ล้มการบันทึกสถานะออกแบบ: ใบงานอัปเดตพลาดก็ยังถือว่าบันทึกสำเร็จ
    if (typeof update.design_status === 'string') {
        try {
            await autoFinishGraphicJobs(leadId, update.design_status, session.userId)
        } catch (e) {
            console.error('[jobs] auto-finish graphic threw:', e)
        }
    }

    revalidatePath('/jobs/tracking')
    return { success: true }
}

/**
 * อีเวนต์ปลายทางของงานหนึ่ง — เส้นทางเดียวกันสำหรับจัดคนและจองกระเป๋า
 * - ส่ง eventId มา = ใช้ใบนั้น (ต้องผูกกับงานนี้จริง)
 * - ไม่ส่ง + opts.pickExisting = หยิบอีเวนต์ที่ยังไม่ปิดใบแรกของงาน (เรียงตามวันงาน — กติกาเดียวกับที่ UI ตั้งต้นให้)
 * - ยังไม่มีอีเวนต์ = สร้างอีเวนต์ "main" จากข้อมูลงานให้อัตโนมัติ
 * สิทธิ์: ทุกคนที่ล็อกอิน (ต่างจาก createEvent ที่ admin-only) เพราะผู้ใช้หลักคือฝ่ายประสานงาน/ทีมหน้างาน
 */
async function resolveLeadEvent(
    supabase: ReturnType<typeof createServiceClient>,
    leadId: string,
    eventId: string | null,
    opts: { pickExisting?: boolean; source: string }
): Promise<{ eventId: string } | { error: string }> {
    const { data: lead } = await supabase
        .from('crm_leads').select('id, customer_name, event_location, event_date, status').eq('id', leadId).single()
    if (!lead || lead.status !== 'accepted') return { error: 'ไม่พบงานที่ตอบรับแล้ว' }

    if (eventId) {
        const { data: ev } = await supabase.from('events').select('id, crm_lead_id').eq('id', eventId).single()
        if (!ev || ev.crm_lead_id !== leadId) return { error: 'อีเวนต์ไม่ได้ผูกกับงานนี้' }
        return { eventId }
    }

    if (opts.pickExisting) {
        // อีเวนต์ที่ปิดแล้วแตะไม่ได้ — คัดในโค้ดเพราะ status เป็น null ได้ (neq จะตัดแถว null ทิ้งด้วย)
        const { data: existing } = await supabase
            .from('events')
            .select('id, status')
            .eq('crm_lead_id', leadId)
            .order('event_date', { ascending: true, nullsFirst: false })
        const open = (existing || []).find(e => !isClosedEvent(e.status))
        if (open) return { eventId: open.id as string }
    }

    const name = [lead.customer_name || 'ไม่ระบุลูกค้า', lead.event_location].filter(Boolean).join(' / ')
    const { data: created, error: createErr } = await supabase
        .from('events')
        .insert({
            name,
            location: lead.event_location,
            event_date: lead.event_date || new Date().toISOString().slice(0, 10),
            crm_lead_id: leadId,
            phase: 'main',
        })
        .select('id')
        .single()
    if (createErr || !created) return { error: createErr?.message || 'สร้างอีเวนต์ไม่สำเร็จ' }

    await logActivity('CREATE_EVENT_FROM_CRM', { lead_id: leadId, event_id: created.id, name, source: opts.source })
    return { eventId: created.id as string }
}

/**
 * จัดคนให้งาน (accepted lead) จากหน้า /jobs/tracking — เขียน event_staff ของอีเวนต์ที่ผูกกับงาน
 * eventId = null → สร้างอีเวนต์ "main" จากข้อมูลงานให้อัตโนมัติ
 * ลบ+ใส่ใหม่ทั้งชุดของอีเวนต์นั้น แล้ว sync array ใน crm_leads เหมือน updateEvent
 */
export async function assignLeadStaff(
    leadId: string,
    eventId: string | null,
    assignments: { user_id: string; role: string }[]
) {
    const session = await requireAuth()
    if (!session) return { error: 'Unauthorized' }

    const supabase = createServiceClient()

    const { data: roleRows } = await supabase
        .from('crm_settings').select('value').eq('category', 'staff_role').eq('is_active', true)
    const validRoles = new Set((roleRows || []).map(r => r.value as string))
    const clean = Array.from(
        new Map(assignments
            .filter(a => a.user_id && validRoles.has(a.role))
            .map(a => [`${a.user_id}:${a.role}`, { user_id: a.user_id, role: a.role }])
        ).values()
    )
    if (clean.length !== assignments.length) return { error: 'ตำแหน่งไม่ถูกต้อง' }

    const resolved = await resolveLeadEvent(supabase, leadId, eventId, { source: 'tracking' })
    if ('error' in resolved) return { error: resolved.error }
    const targetEventId = resolved.eventId

    const { error: delErr } = await supabase.from('event_staff').delete().eq('event_id', targetEventId)
    if (delErr) return { error: delErr.message }
    if (clean.length > 0) {
        const { error: insErr } = await supabase
            .from('event_staff')
            .insert(clean.map(a => ({ event_id: targetEventId, user_id: a.user_id, role: a.role })))
        if (insErr) return { error: insErr.message }
    }

    const { syncLeadArraysFromEvents } = await import('../events/actions')
    await syncLeadArraysFromEvents(supabase, leadId)

    await logActivity('ASSIGN_EVENT_STAFF', { lead_id: leadId, event_id: targetEventId, count: clean.length })
    revalidatePath('/jobs/tracking')
    revalidatePath('/events')
    return { success: true, eventId: targetEventId }
}

/**
 * cache รถของงานใน crm_leads.tracking_checklist — read path เดิมทั้งหมดยังอ่านค่านี้อยู่
 * (vehicleOf, ความพร้อม, เลนรถในไทม์ไลน์, การชน, สรุปหน้าที่) และเก็บได้คันเดียวต่อหนึ่งงาน
 *
 * กติกา: cache ถือรถของ "อีเวนต์ที่ยังไม่ปิดใบแรก (เรียงตามวันงาน) ที่มีการจองรถ"
 * — ไม่มีใบที่เปิดอยู่จองไว้เลย แต่มีการจองค้างอยู่ใบเดียว → ใช้คันนั้น
 * — นอกนั้น (ไม่มีการจอง) → ไม่มีรถ
 * งานที่มีหลายอีเวนต์และจัดคนละคัน ค่าที่เห็นรายอีเวนต์อ่านจาก event_vehicles ตรงๆ ไม่ใช่ cache นี้
 */
async function syncLeadVehicleCache(
    supabase: ReturnType<typeof createServiceClient>,
    leadId: string
): Promise<{ tracking_checklist: string[] } | { error: string }> {
    const { data: events } = await supabase
        .from('events')
        .select('id, status')
        .eq('crm_lead_id', leadId)
        .order('event_date', { ascending: true, nullsFirst: false })
    const eventIds = (events || []).map(e => e.id as string)

    let rows: { event_id: string; vehicle_key: string }[] = []
    if (eventIds.length > 0) {
        const { data } = await supabase.from('event_vehicles').select('event_id, vehicle_key').in('event_id', eventIds)
        rows = ((data || []) as { event_id: string; vehicle_key: string }[]).filter(r =>
            CHECKLIST_KEYS.includes(r.vehicle_key)
        )
    }
    const byEvent = new Map(rows.map(r => [r.event_id, r.vehicle_key]))
    const firstOpen = (events || []).find(e => !isClosedEvent(e.status as string | null) && byEvent.has(e.id as string))
    const vehicleKey = firstOpen
        ? byEvent.get(firstOpen.id as string)!
        : rows.length === 1
          ? rows[0].vehicle_key
          : null

    const { data: lead } = await supabase.from('crm_leads').select('tracking_checklist').eq('id', leadId).single()
    const current = Array.isArray(lead?.tracking_checklist) ? (lead?.tracking_checklist as string[]) : []
    const tracking_checklist = [
        ...current.filter(k => !CHECKLIST_KEYS.includes(k)),
        ...(vehicleKey ? [vehicleKey] : []),
    ]
    const { error } = await supabase.from('crm_leads').update({ tracking_checklist }).eq('id', leadId)
    if (error) return { error: error.message }
    return { tracking_checklist }
}

/**
 * จัดรถให้งาน — จองรถผูกกับ "อีเวนต์" ผ่าน event_vehicles (ADR-0004) เหมือนคนและกระเป๋า
 * งานที่ยังไม่มีอีเวนต์ ระบบเปิดอีเวนต์ให้อัตโนมัติ (เส้นทางเดียวกับจองกระเป๋า)
 * vehicleKey = null → เอารถออก (ลบการจองรถของทุกอีเวนต์ของงานนี้)
 *
 * eventId = ระบุอีเวนต์ปลายทาง (ตารางภาพรวมของงานที่มีหลายอีเวนต์) → แก้เฉพาะการจองของใบนั้น
 * ใบอื่นของงานเดียวกันไม่ถูกแตะ · ไม่ส่ง = พฤติกรรมเดิม (หนึ่งงานหนึ่งคัน ล้างทุกใบก่อน)
 *
 * แล้ว sync crm_leads.tracking_checklist (cache รถระดับงาน) ตามกติกาใน syncLeadVehicleCache
 */
export async function assignLeadVehicle(leadId: string, vehicleKey: string | null, eventId?: string | null) {
    const session = await requireAuth()
    if (!session) return { error: 'Unauthorized' }
    if (vehicleKey !== null && !CHECKLIST_KEYS.includes(vehicleKey)) return { error: 'รายการจัดรถไม่ถูกต้อง' }

    const supabase = createServiceClient()

    // ระบุอีเวนต์มา = จัดรถรายอีเวนต์ (งานหนึ่งงานมีได้หลายคัน คันละอีเวนต์)
    if (eventId) {
        const resolved = await resolveLeadEvent(supabase, leadId, eventId, { source: 'vehicle-booking' })
        if ('error' in resolved) return { error: resolved.error }

        const { error: delErr } = await supabase.from('event_vehicles').delete().eq('event_id', eventId)
        if (delErr) return { error: delErr.message }
        if (vehicleKey) {
            const { error: insErr } = await supabase
                .from('event_vehicles')
                .upsert({ event_id: eventId, vehicle_key: vehicleKey }, { onConflict: 'event_id,vehicle_key' })
            if (insErr) return { error: insErr.message }
        }

        const synced = await syncLeadVehicleCache(supabase, leadId)
        if ('error' in synced) return { error: synced.error }

        await logActivity('ASSIGN_EVENT_VEHICLE', { leadId, eventId, vehicleKey })
        revalidatePath('/jobs/tracking')
        revalidatePath('/events')
        return { success: true, eventId, tracking_checklist: synced.tracking_checklist }
    }

    // อีเวนต์ทั้งหมดของงาน — หนึ่งงานจัดรถได้คันเดียว จึงล้างการจองเก่าของทุกใบก่อน
    const { data: leadEvents } = await supabase.from('events').select('id').eq('crm_lead_id', leadId)
    const eventIds = (leadEvents || []).map(e => e.id as string)

    let targetEventId: string | null = null
    if (vehicleKey) {
        const resolved = await resolveLeadEvent(supabase, leadId, null, { pickExisting: true, source: 'vehicle-booking' })
        if ('error' in resolved) return { error: resolved.error }
        targetEventId = resolved.eventId
        if (!eventIds.includes(targetEventId)) eventIds.push(targetEventId)
    }

    if (eventIds.length > 0) {
        const { error: delErr } = await supabase.from('event_vehicles').delete().in('event_id', eventIds)
        if (delErr) return { error: delErr.message }
    }
    if (targetEventId && vehicleKey) {
        const { error: insErr } = await supabase
            .from('event_vehicles')
            .upsert({ event_id: targetEventId, vehicle_key: vehicleKey }, { onConflict: 'event_id,vehicle_key' })
        if (insErr) return { error: insErr.message }
    }

    const { data: lead } = await supabase.from('crm_leads').select('tracking_checklist').eq('id', leadId).single()
    const current = Array.isArray(lead?.tracking_checklist) ? (lead?.tracking_checklist as string[]) : []
    const tracking_checklist = [
        ...current.filter(k => !CHECKLIST_KEYS.includes(k)),
        ...(vehicleKey ? [vehicleKey] : []),
    ]
    const { error: syncErr } = await supabase.from('crm_leads').update({ tracking_checklist }).eq('id', leadId)
    if (syncErr) return { error: syncErr.message }

    await logActivity('ASSIGN_EVENT_VEHICLE', { leadId, eventId: targetEventId, vehicleKey })

    revalidatePath('/jobs/tracking')
    revalidatePath('/events')
    return { success: true, eventId: targetEventId, tracking_checklist }
}

// ============================================================================
// จองกระเป๋า / จัดกระเป๋า — event_kits เป็น source of truth ของการจอง (ADR-0003)
// ============================================================================

/** แผนกที่จอง/ย้ายกระเป๋าได้ — ตั้งค่าเองได้ใน job_settings (ยังไม่ตั้ง = ทีมหน้างานตามค่าเริ่มต้น) */
const KIT_MANAGER_CATEGORY: PoolTeamCategory = 'pool_kit_departments'

async function getKitManagerDepartments(): Promise<string[]> {
    return getDepartmentSetting(KIT_MANAGER_CATEGORY, [...POOL_TEAM_DEFAULTS[KIT_MANAGER_CATEGORY]])
}

/** ผู้กดต้องเป็นแอดมิน หรืออยู่แผนกที่ดูแลกระเป๋า — สิทธิ์เดียวกันทั้งจอง/ยกเลิก/บันทึกจัดครบ */
async function requireKitManager(): Promise<{ actor: PoolActor } | { error: string }> {
    const actor = await getPoolActor()
    if (!actor) return { error: 'ไม่ได้เข้าสู่ระบบ' }

    const departments = await getKitManagerDepartments()
    if (!canActOnPool(actor.department, actor.role === 'admin', departments)) {
        return { error: 'เฉพาะทีมที่ดูแลกระเป๋าเท่านั้นที่จองหรือย้ายกระเป๋าได้' }
    }
    return { actor }
}

/** การจองของกระเป๋าใบหนึ่งพร้อมวัน/ชื่อ/สถานะ/งานของอีเวนต์ (join events) */
type KitBookingRow = {
    event_id: string
    events?: {
        id: string
        name: string | null
        event_date: string | null
        status: string | null
        crm_lead_id: string | null
    } | null
}

const KIT_BOOKING_SELECT = 'event_id, events!inner(id, name, event_date, status, crm_lead_id)'

async function loadKitBookings(
    supabase: ReturnType<typeof createServiceClient>,
    kitId: string
): Promise<KitBookingRow[]> {
    const { data } = await supabase.from('event_kits').select(KIT_BOOKING_SELECT).eq('kit_id', kitId)
    return (data || []) as unknown as KitBookingRow[]
}

/**
 * kits.event_id เดิม = ตัวชี้ใบเดียวที่ flow เช็ค/คืนกระเป๋าเก่ายังใช้อยู่ — event_kits คือ source of truth (ADR-0003)
 * จองใหม่: ชี้ให้เฉพาะตอนที่กระเป๋ายังไม่มีการจองอื่นของอีเวนต์ที่ยังไม่ปิด (ไม่งั้นสองงานจะแย่งตัวชี้กัน)
 * ยกเลิกจอง: ตัวชี้ที่ค้างอยู่กับอีเวนต์ที่ไม่มีการจองแล้ว → ล้างเป็น null
 */
async function syncLegacyKitEvent(
    supabase: ReturnType<typeof createServiceClient>,
    kitId: string,
    justBookedEventId: string | null
) {
    const { data: kit } = await supabase.from('kits').select('id, event_id').eq('id', kitId).single()
    if (!kit) return

    const active = (await loadKitBookings(supabase, kitId))
        .filter(r => !isClosedEvent(r.events?.status))
        .map(r => r.event_id)

    if (justBookedEventId) {
        if (active.length === 1 && active[0] === justBookedEventId && kit.event_id !== justBookedEventId) {
            await supabase.from('kits').update({ event_id: justBookedEventId }).eq('id', kitId)
        }
        return
    }
    if (kit.event_id && !active.includes(kit.event_id as string)) {
        await supabase.from('kits').update({ event_id: null }).eq('id', kitId)
    }
}

/**
 * จองกระเป๋าให้อีเวนต์ของงาน (จากใบงานหน้างานในพูล) — งานที่ยังไม่มีอีเวนต์ ระบบสร้างให้เหมือนตอนจัดคน
 * ชน = กระเป๋าใบเดียวกันถูกจองอีเวนต์อื่นวันเดียวกัน (ไม่ดูเวลา ไม่มีต่อคิว)
 *
 * eventId = จองให้อีเวนต์ใบนั้นตรงๆ (ตารางภาพรวมของงานที่มีหลายอีเวนต์) — ตรวจว่าใบนั้นเป็นของงานนี้จริง
 * ไม่ส่ง = พฤติกรรมเดิม (อีเวนต์ที่ยังไม่ปิดใบแรก หรือสร้างใหม่ให้)
 */
export async function bookKitForLead(leadId: string, kitId: string, eventId?: string | null) {
    const perm = await requireKitManager()
    if ('error' in perm) return { error: perm.error }

    const supabase = createServiceClient()
    const { data: kit } = await supabase.from('kits').select('id, name').eq('id', kitId).single()
    if (!kit) return { error: 'ไม่พบกระเป๋าใบนี้' }

    // resolveLeadEvent ตรวจให้แล้วว่า eventId ที่ส่งมาผูกกับงานนี้จริง (ไม่ใช่ = error)
    const resolved = await resolveLeadEvent(supabase, leadId, eventId ?? null, { pickExisting: true, source: 'kit-booking' })
    if ('error' in resolved) return { error: resolved.error }
    const targetEventId = resolved.eventId

    const { data: target } = await supabase.from('events').select('id, event_date').eq('id', targetEventId).single()
    const eventDate = (target?.event_date as string) ?? null

    const bookings = await loadKitBookings(supabase, kitId)
    const clash = kitBookingConflict(
        bookings.map(r => ({ kitId, eventId: r.event_id, eventDate: r.events?.event_date ?? null })),
        { kitId, eventId: targetEventId, eventDate }
    )
    if (clash.length > 0) {
        const names = clash.map(id => bookings.find(r => r.event_id === id)?.events?.name || 'อีเวนต์อื่น')
        return { error: `กระเป๋าใบนี้ถูกจองงานวันเดียวกันแล้ว: ${names.join(', ')}` }
    }

    // จองซ้ำคู่เดิม = ไม่เปลี่ยนอะไร (unique (event_id, kit_id)) — สถานะจัดของเดิมจึงไม่หาย
    const { error: insErr } = await supabase
        .from('event_kits')
        .upsert({ event_id: targetEventId, kit_id: kitId }, { onConflict: 'event_id,kit_id' })
    if (insErr) return { error: insErr.message }

    await syncLegacyKitEvent(supabase, kitId, targetEventId)
    await logActivity('BOOK_EVENT_KIT', { lead_id: leadId, event_id: targetEventId, kit_id: kitId, kit_name: kit.name })

    revalidatePath('/jobs/tracking')
    revalidatePath('/events')
    revalidatePath('/kits')
    return { success: true, eventId: targetEventId }
}

/**
 * ยกเลิกจองกระเป๋าของงาน — ลบแถวการจองของอีเวนต์ที่ผูกกับงานนี้ทิ้ง
 * สถานะจัดกระเป๋าอยู่บนแถวการจอง จึงหายไปพร้อมกัน (ย้ายไปอีเวนต์อื่น = ลบ+จองใหม่ → ต้องจัดใหม่)
 *
 * eventId = ยกเลิกเฉพาะการจองของอีเวนต์ใบนั้น (ต้องเป็นอีเวนต์ของงานนี้) — ใบอื่นของงานเดียวกันไม่ถูกแตะ
 * ไม่ส่ง = พฤติกรรมเดิม (ยกเลิกทุกใบของงานนี้)
 */
export async function unbookKitForLead(leadId: string, kitId: string, eventId?: string | null) {
    const perm = await requireKitManager()
    if ('error' in perm) return { error: perm.error }

    const supabase = createServiceClient()
    const rows = (await loadKitBookings(supabase, kitId))
        .filter(r => r.events?.crm_lead_id === leadId)
        .filter(r => !eventId || r.event_id === eventId)
    if (rows.length === 0) {
        return { error: eventId ? 'กระเป๋าใบนี้ยังไม่ได้ถูกจองให้อีเวนต์นี้' : 'กระเป๋าใบนี้ยังไม่ได้ถูกจองให้งานนี้' }
    }

    const eventIds = rows.map(r => r.event_id)
    const { error } = await supabase.from('event_kits').delete().eq('kit_id', kitId).in('event_id', eventIds)
    if (error) return { error: error.message }

    await syncLegacyKitEvent(supabase, kitId, null)
    await logActivity('UNBOOK_EVENT_KIT', { lead_id: leadId, event_ids: eventIds, kit_id: kitId })

    revalidatePath('/jobs/tracking')
    revalidatePath('/events')
    revalidatePath('/kits')
    return { success: true, eventIds }
}

/**
 * บันทึก "จัดกระเป๋าครบ" ของการจองหนึ่งครั้ง — เรียกจากหน้าเช็คกระเป๋าเมื่อติ๊กครบทุกชิ้น
 * เก็บบนแถว event_kits จึงเป็นของอีเวนต์นั้นโดยเฉพาะ (ย้ายการจอง = ลบแถว → สถานะจัดรีเซ็ตเอง)
 */
export async function setKitPacked(eventId: string, kitId: string, packed: boolean) {
    const perm = await requireKitManager()
    if ('error' in perm) return { error: perm.error }

    const supabase = createServiceClient()
    const { data: updated, error } = await supabase
        .from('event_kits')
        .update(
            packed
                ? { packed_at: new Date().toISOString(), packed_by: perm.actor.userId }
                : { packed_at: null, packed_by: null }
        )
        .eq('event_id', eventId)
        .eq('kit_id', kitId)
        .select('id')

    if (error) return { error: error.message }
    if (!updated || updated.length === 0) return { error: 'กระเป๋าใบนี้ยังไม่ได้ถูกจองให้อีเวนต์นี้' }

    await logActivity('PACK_EVENT_KIT', { event_id: eventId, kit_id: kitId, packed })

    revalidatePath('/jobs/tracking')
    revalidatePath(`/events/${eventId}/check-kits`)
    return { success: true }
}
