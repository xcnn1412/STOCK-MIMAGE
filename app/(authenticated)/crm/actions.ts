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
    .eq('is_approved', true)
    .order('full_name')

  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

// ============================================================================
// CRM Settings — CRUD
// ============================================================================

export async function getCrmSettings(category?: string) {
  const supabase = createServiceClient()
  let query = supabase
    .from('crm_settings')
    .select('*')
    .order('sort_order', { ascending: true })

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query
  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

export async function createCrmSetting(formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const category = formData.get('category') as string
  const value = formData.get('value') as string
  const label_th = formData.get('label_th') as string
  const label_en = formData.get('label_en') as string
  const color = formData.get('color') as string || null
  const price = formData.get('price') ? Number(formData.get('price')) : null
  const description = formData.get('description') as string || null
  const sort_order = formData.get('sort_order') ? Number(formData.get('sort_order')) : 0

  const { error } = await supabase.from('crm_settings').insert({
    category, value, label_th, label_en, color, price, description, sort_order
  })

  if (error) return { error: error.message }

  await logActivity('CREATE_CRM_SETTING', { category, value, label_th })
  revalidatePath('/crm')
  return { success: true }
}

export async function updateCrmSetting(id: string, formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const updates: Record<string, unknown> = {}

  const fields = ['value', 'label_th', 'label_en', 'color', 'description', 'category']
  fields.forEach(f => {
    const v = formData.get(f)
    if (v !== null) updates[f] = v as string
  })
  if (formData.get('price') !== null) updates.price = formData.get('price') ? Number(formData.get('price')) : null
  if (formData.get('sort_order') !== null) updates.sort_order = Number(formData.get('sort_order') || 0)
  if (formData.has('is_active')) updates.is_active = formData.get('is_active') === 'true'

  const { error } = await supabase.from('crm_settings').update(updates).eq('id', id)
  if (error) return { error: error.message }

  await logActivity('UPDATE_CRM_SETTING', { id, changes: Object.keys(updates).join(', ') })
  revalidatePath('/crm')
  return { success: true }
}

export async function deleteCrmSetting(id: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { error } = await supabase.from('crm_settings').delete().eq('id', id)
  if (error) return { error: error.message }

  await logActivity('DELETE_CRM_SETTING', { id })
  revalidatePath('/crm')
  return { success: true }
}

export async function toggleCrmSetting(id: string, is_active: boolean) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { error } = await supabase.from('crm_settings').update({ is_active }).eq('id', id)
  if (error) return { error: error.message }

  await logActivity('UPDATE_CRM_SETTING', { id, is_active })
  revalidatePath('/crm')
  return { success: true }
}

// ============================================================================
// CRM Leads — CRUD
// ============================================================================

export async function getLeads(filters?: {
  status?: string
  source?: string
  month?: string
  is_returning?: boolean
  search?: string
  includeArchived?: boolean
}) {
  const supabase = createServiceClient()
  let query = supabase
    .from('crm_leads')
    .select('*')
    .order('created_at', { ascending: false })

  // By default, exclude archived leads
  if (!filters?.includeArchived) {
    query = query.is('archived_at', null)
  }

  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.source) query = query.eq('lead_source', filters.source)
  if (filters?.is_returning !== undefined) query = query.eq('is_returning', filters.is_returning)
  if (filters?.search) {
    // Sanitize: strip PostgREST special chars to prevent filter manipulation
    const sanitized = filters.search.replace(/[.,()]/g, '').trim()
    if (sanitized) {
      query = query.or(`customer_name.ilike.%${sanitized}%,customer_line.ilike.%${sanitized}%`)
    }
  }
  if (filters?.month) {
    const [year, month] = filters.month.split('-')
    const start = `${year}-${month}-01`
    const endDate = new Date(Number(year), Number(month), 0)
    const end = `${year}-${month}-${String(endDate.getDate()).padStart(2, '0')}`
    query = query.gte('created_at', `${start}T00:00:00`).lte('created_at', `${end}T23:59:59`)
  }

  const { data, error } = await query
  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

export async function getArchivedLeads() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('crm_leads')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })

  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

export async function getLead(id: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('crm_leads')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return { error: error.message, data: null }
  return { data }
}

export async function createLead(formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const eventDate = formData.get('event_date') as string || null
  const eventEndDate = formData.get('event_end_date') as string || null
  let event_days = 1
  if (eventDate && eventEndDate) {
    const diff = Math.round((new Date(eventEndDate).getTime() - new Date(eventDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
    event_days = Math.max(1, diff)
  }

  const lead = {
    customer_name: formData.get('customer_name') as string,
    customer_line: formData.get('customer_line') as string || null,
    customer_phone: formData.get('customer_phone') as string || null,
    customer_type: formData.get('customer_type') as string || null,
    lead_source: formData.get('lead_source') as string || null,
    is_returning: formData.get('is_returning') === 'true',
    event_date: eventDate,
    event_end_date: eventEndDate,
    event_days,
    event_location: formData.get('event_location') as string || null,
    event_details: formData.get('event_details') as string || null,
    package_name: formData.get('package_name') as string || null,
    quoted_price: Number(formData.get('quoted_price') || 0),
    confirmed_price: Number(formData.get('confirmed_price') || 0),
    deposit: Number(formData.get('deposit') || 0),
    quotation_ref: formData.get('quotation_ref') as string || null,
    notes: formData.get('notes') as string || null,
    vat_mode: formData.get('vat_mode') as string || 'none',
    wht_rate: Number(formData.get('wht_rate') || 0),
    created_by: userId,
    status: 'lead',
    tags: (formData.get('tags') as string || '').split(',').map(t => t.trim()).filter(Boolean),
    assigned_sales: (formData.get('assigned_sales') as string || '').split(',').filter(Boolean),
    assigned_graphics: (formData.get('assigned_graphics') as string || '').split(',').filter(Boolean),
    assigned_staff: (formData.get('assigned_staff') as string || '').split(',').filter(Boolean),
  }

  const { data, error } = await supabase.from('crm_leads').insert(lead).select().single()
  if (error) return { error: error.message }

  // Save dynamic installments
  const installmentCount = Number(formData.get('installment_count') || 0)
  if (installmentCount > 0) {
    const installmentRows = []
    for (let i = 1; i <= installmentCount; i++) {
      const amount = Number(formData.get(`installment_${i}`) || 0)
      const dueDate = (formData.get(`installment_${i}_date`) as string) || null
      if (amount > 0 || dueDate) {
        installmentRows.push({
          lead_id: data.id,
          installment_number: i,
          amount,
          due_date: dueDate,
          is_paid: false,
          paid_date: null,
        })
      }
    }
    if (installmentRows.length > 0) {
      await supabase.from('crm_lead_installments').insert(installmentRows)
    }
  }

  await logActivity('CREATE_CRM_LEAD', {
    id: data.id,
    customer_name: lead.customer_name,
    is_returning: lead.is_returning,
    lead_source: lead.lead_source,
  })

  revalidatePath('/crm')
  return { success: true, id: data.id }
}

export async function updateLead(id: string, formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  const textFields = [
    'customer_name', 'customer_line', 'customer_phone', 'customer_type',
    'lead_source', 'event_location', 'event_details', 'package_name',
    'quotation_ref', 'notes'
  ]
  textFields.forEach(f => {
    const v = formData.get(f)
    if (v !== null) updates[f] = v as string || null
  })

  const dateFields = ['event_date', 'event_end_date']
  dateFields.forEach(f => {
    const v = formData.get(f)
    if (v !== null) updates[f] = (v as string) || null
  })

  const numFields = ['quoted_price', 'confirmed_price', 'deposit', 'wht_rate']
  numFields.forEach(f => {
    const v = formData.get(f)
    if (v !== null) updates[f] = Number(v) || 0
  })

  if (formData.has('is_returning')) updates.is_returning = formData.get('is_returning') === 'true'
  if (formData.has('vat_mode')) updates.vat_mode = formData.get('vat_mode') as string || 'none'

  // Legacy installment fields — still accept updates for backward compat
  const legacyDateFields = ['installment_1_date', 'installment_2_date', 'installment_3_date', 'installment_4_date', 'installment_1_paid_date', 'installment_2_paid_date', 'installment_3_paid_date', 'installment_4_paid_date']
  legacyDateFields.forEach(f => {
    const v = formData.get(f)
    if (v !== null) updates[f] = (v as string) || null
  })
  const legacyNumFields = ['installment_1', 'installment_2', 'installment_3', 'installment_4']
  legacyNumFields.forEach(f => {
    const v = formData.get(f)
    if (v !== null) updates[f] = Number(v) || 0
  })
  const paidFields = ['installment_1_paid', 'installment_2_paid', 'installment_3_paid', 'installment_4_paid']
  paidFields.forEach(f => {
    if (formData.has(f)) updates[f] = formData.get(f) === 'true'
  })

  // Tags — comma-separated string to array
  if (formData.has('tags')) {
    const tagsStr = formData.get('tags') as string || ''
    updates.tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean)
  }

  // Staff assignment arrays — comma-separated string to array
  const arrayFields = ['assigned_sales', 'assigned_graphics', 'assigned_staff']
  arrayFields.forEach(f => {
    if (formData.has(f)) {
      const str = formData.get(f) as string || ''
      updates[f] = str.split(',').filter(Boolean)
    }
  })

  // Auto-calculate event_days
  const ed = (updates.event_date as string) || null
  const eed = (updates.event_end_date as string) || null
  if (ed && eed) {
    const diff = Math.round((new Date(eed).getTime() - new Date(ed).getTime()) / (1000 * 60 * 60 * 24)) + 1
    updates.event_days = Math.max(1, diff)
  }

  const { error } = await supabase.from('crm_leads').update(updates).eq('id', id)
  if (error) return { error: error.message }

  await logActivity('UPDATE_CRM_LEAD', { id, changes: Object.keys(updates).join(', ') })
  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  return { success: true }
}

export async function updateLeadStatus(id: string, newStatus: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // Get current status
  const { data: lead } = await supabase.from('crm_leads').select('status').eq('id', id).single()
  const oldStatus = lead?.status || 'unknown'

  // Update status
  const { error } = await supabase
    .from('crm_leads')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }

  // Log activity in crm_activities
  await supabase.from('crm_activities').insert({
    lead_id: id,
    created_by: userId,
    activity_type: 'status_change',
    description: `สถานะเปลี่ยน: ${oldStatus} → ${newStatus}`,
    old_status: oldStatus,
    new_status: newStatus,
  })

  await logActivity('UPDATE_CRM_STATUS', { id, oldStatus, newStatus })
  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  return { success: true }
}

export async function deleteLead(id: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { error } = await supabase.from('crm_leads').delete().eq('id', id)
  if (error) return { error: error.message }

  await logActivity('DELETE_CRM_LEAD', { id })
  revalidatePath('/crm')
  return { success: true }
}

export async function archiveLead(id: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('crm_leads')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }

  // Log activity
  await supabase.from('crm_activities').insert({
    lead_id: id,
    created_by: userId,
    activity_type: 'note',
    description: 'ย้ายไปที่ Archive',
  })

  await logActivity('ARCHIVE_CRM_LEAD', { id })
  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  return { success: true }
}

export async function unarchiveLead(id: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('crm_leads')
    .update({ archived_at: null })
    .eq('id', id)
  if (error) return { error: error.message }

  // Log activity
  await supabase.from('crm_activities').insert({
    lead_id: id,
    created_by: userId,
    activity_type: 'note',
    description: 'นำออกจาก Archive แล้ว',
  })

  await logActivity('UNARCHIVE_CRM_LEAD', { id })
  revalidatePath('/crm')
  revalidatePath(`/crm/${id}`)
  revalidatePath('/crm/archive')
  return { success: true }
}

// ============================================================================
// CRM Activities — บันทึกการติดตาม
// ============================================================================

export async function getActivities(leadId: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('crm_activities')
    .select('*, profiles:created_by(full_name)')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

export async function createActivity(leadId: string, formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const activity_type = formData.get('activity_type') as string
  const description = formData.get('description') as string

  const { error } = await supabase.from('crm_activities').insert({
    lead_id: leadId,
    created_by: userId,
    activity_type,
    description,
  })

  if (error) return { error: error.message }

  // Update lead's updated_at
  await supabase.from('crm_leads').update({ updated_at: new Date().toISOString() }).eq('id', leadId)

  await logActivity('CREATE_CRM_ACTIVITY', { leadId, activity_type, description })
  revalidatePath(`/crm/${leadId}`)
  return { success: true }
}

// ============================================================================
// เปิดอีเวนต์จาก CRM Lead
// ============================================================================

export async function createEventFromLead(leadId: string) {
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
  if (lead.event_id) return { error: 'Lead นี้เปิดอีเวนต์แล้ว' }

  // Create job_cost_events
  const { data: event, error: eventErr } = await supabase
    .from('job_cost_events')
    .insert({
      event_name: `${lead.customer_name} — ${lead.package_name || 'N/A'}`,
      event_date: lead.event_date,
      event_location: lead.event_location,
      staff: null,
      revenue: lead.confirmed_price || lead.quoted_price || 0,
      status: 'draft',
      notes: lead.notes,
      imported_by: userId,
    })
    .select()
    .single()

  if (eventErr || !event) return { error: eventErr?.message || 'สร้าง Event ไม่สำเร็จ' }

  // Update lead with event_id
  await supabase
    .from('crm_leads')
    .update({ event_id: event.id, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  // Log activity
  await supabase.from('crm_activities').insert({
    lead_id: leadId,
    created_by: userId,
    activity_type: 'note',
    description: `เปิดอีเวนต์แล้ว: ${event.event_name}`,
  })

  await logActivity('CREATE_EVENT_FROM_CRM', { leadId, eventId: event.id })
  revalidatePath('/crm')
  revalidatePath(`/crm/${leadId}`)
  revalidatePath('/costs/events')
  return { success: true, eventId: event.id }
}

// ============================================================================
// CRM Lead Installments — CRUD (Normalized)
// ============================================================================

export interface LeadInstallment {
  id: string
  lead_id: string
  installment_number: number
  amount: number
  due_date: string | null
  is_paid: boolean
  paid_date: string | null
  created_at: string
}

export async function getLeadInstallments(leadId: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('crm_lead_installments')
    .select('*')
    .eq('lead_id', leadId)
    .order('installment_number', { ascending: true })

  if (error) return []
  return (data || []) as LeadInstallment[]
}

export async function upsertInstallment(leadId: string, installment: {
  installment_number: number
  amount: number
  due_date: string | null
  is_paid: boolean
  paid_date: string | null
}) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('crm_lead_installments')
    .upsert(
      {
        lead_id: leadId,
        installment_number: installment.installment_number,
        amount: installment.amount,
        due_date: installment.due_date || null,
        is_paid: installment.is_paid,
        paid_date: installment.paid_date || null,
      },
      { onConflict: 'lead_id,installment_number' }
    )

  if (error) return { error: error.message }

  // Also update lead's updated_at
  await supabase.from('crm_leads').update({ updated_at: new Date().toISOString() }).eq('id', leadId)

  revalidatePath(`/crm/${leadId}`)
  revalidatePath('/crm/payments')
  return { success: true }
}

export async function deleteInstallment(id: string, leadId: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { error } = await supabase.from('crm_lead_installments').delete().eq('id', id)
  if (error) return { error: error.message }

  // Re-number remaining installments
  const { data: remaining } = await supabase
    .from('crm_lead_installments')
    .select('id, installment_number')
    .eq('lead_id', leadId)
    .order('installment_number', { ascending: true })

  if (remaining) {
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].installment_number !== i + 1) {
        await supabase
          .from('crm_lead_installments')
          .update({ installment_number: i + 1 })
          .eq('id', remaining[i].id)
      }
    }
  }

  await supabase.from('crm_leads').update({ updated_at: new Date().toISOString() }).eq('id', leadId)

  revalidatePath(`/crm/${leadId}`)
  revalidatePath('/crm/payments')
  return { success: true }
}

/** Bulk save all installments for a lead (used by the lead detail form) */
export async function saveAllInstallments(leadId: string, installments: Array<{
  installment_number: number
  amount: number
  due_date: string | null
  is_paid: boolean
  paid_date: string | null
}>) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // Delete existing
  await supabase.from('crm_lead_installments').delete().eq('lead_id', leadId)

  // Insert new
  if (installments.length > 0) {
    const rows = installments.map(inst => ({
      lead_id: leadId,
      installment_number: inst.installment_number,
      amount: inst.amount,
      due_date: inst.due_date || null,
      is_paid: inst.is_paid,
      paid_date: inst.paid_date || null,
    }))
    const { error } = await supabase.from('crm_lead_installments').insert(rows)
    if (error) return { error: error.message }
  }

  await supabase.from('crm_leads').update({ updated_at: new Date().toISOString() }).eq('id', leadId)

  revalidatePath(`/crm/${leadId}`)
  revalidatePath('/crm/payments')
  return { success: true }
}
