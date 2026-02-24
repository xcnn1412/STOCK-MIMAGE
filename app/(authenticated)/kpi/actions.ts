'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.types'

function createServerSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
}

/** ดึง session user id + role */
async function getSession() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value
  return { userId, role }
}

// ============================================================================
// KPI Templates — สร้าง / แก้ไข / ลบ Template
// ============================================================================

export async function createTemplate(formData: FormData) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถจัดการ Template ได้' }

  const supabase = createServerSupabase()

  const name = formData.get('name') as string
  const mode = formData.get('mode') as string
  const description = formData.get('description') as string
  const default_target = Number(formData.get('default_target')) || 0
  const target_unit = (formData.get('target_unit') as string) || ''
  const configRaw = formData.get('config') as string
  const config = configRaw ? JSON.parse(configRaw) : {}

  const { error } = await supabase.from('kpi_templates').insert({
    name,
    mode,
    description,
    default_target,
    target_unit,
    config,
    created_by: userId,
  } as any)

  if (error) {
    console.error(error)
    return { error: 'สร้าง Template ไม่สำเร็จ' }
  }

  await logActivity('CREATE_KPI_TEMPLATE', { name, mode })
  revalidatePath('/kpi/templates')
  return { success: true }
}

export async function updateTemplate(id: string, formData: FormData) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถจัดการ Template ได้' }

  const supabase = createServerSupabase()

  const name = formData.get('name') as string
  const mode = formData.get('mode') as string
  const description = formData.get('description') as string
  const default_target = Number(formData.get('default_target')) || 0
  const target_unit = (formData.get('target_unit') as string) || ''
  const configRaw = formData.get('config') as string
  const config = configRaw ? JSON.parse(configRaw) : {}

  const { error } = await supabase
    .from('kpi_templates')
    .update({ name, mode, description, default_target, target_unit, config } as any)
    .eq('id', id)

  if (error) {
    console.error(error)
    return { error: 'แก้ไข Template ไม่สำเร็จ' }
  }

  await logActivity('UPDATE_KPI_TEMPLATE', { id, name, mode })
  revalidatePath('/kpi/templates')
  return { success: true }
}

export async function deleteTemplate(id: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถจัดการ Template ได้' }

  const supabase = createServerSupabase()

  const { error } = await supabase.from('kpi_templates').delete().eq('id', id)

  if (error) {
    console.error(error)
    return { error: 'ลบ Template ไม่สำเร็จ' }
  }

  await logActivity('DELETE_KPI_TEMPLATE', { id })
  revalidatePath('/kpi/templates')
  return { success: true }
}

// ============================================================================
// KPI Assignments — มอบหมาย KPI ให้พนักงาน
// ============================================================================

export async function createAssignment(formData: FormData) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถมอบหมาย KPI ได้' }

  const supabase = createServerSupabase()

  const template_id = formData.get('template_id') as string | null
  const assigned_to = formData.get('assigned_to') as string
  const target = Number(formData.get('target')) || 0
  const target_unit = (formData.get('target_unit') as string) || ''
  const cycle = formData.get('cycle') as string
  const period_start = formData.get('period_start') as string
  const period_end = formData.get('period_end') as string

  // Custom KPI (fast-track)
  const custom_name = formData.get('custom_name') as string | null
  const custom_mode = formData.get('custom_mode') as string | null
  const custom_config_raw = formData.get('custom_config') as string | null
  const custom_config = custom_config_raw ? JSON.parse(custom_config_raw) : null

  const insertData: Record<string, unknown> = {
    assigned_to,
    target,
    target_unit,
    cycle,
    period_start,
    period_end,
    created_by: userId,
    status: 'active',
  }

  if (template_id) {
    insertData.template_id = template_id
  }
  if (custom_name) {
    insertData.custom_name = custom_name
    insertData.custom_mode = custom_mode
    insertData.custom_config = custom_config
  }

  const { error } = await supabase.from('kpi_assignments').insert(insertData as any)

  if (error) {
    console.error(error)
    return { error: 'สร้าง Assignment ไม่สำเร็จ' }
  }

  await logActivity('CREATE_KPI_ASSIGNMENT', { assigned_to, template_id, custom_name })
  revalidatePath('/kpi/assignments')
  return { success: true }
}

export async function updateAssignment(id: string, data: Record<string, unknown>) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถจัดการ Assignment ได้' }

  const supabase = createServerSupabase()

  const { error } = await supabase.from('kpi_assignments').update(data as any).eq('id', id)

  if (error) {
    console.error(error)
    return { error: 'แก้ไข Assignment ไม่สำเร็จ' }
  }

  await logActivity('UPDATE_KPI_ASSIGNMENT', { id, ...data })
  revalidatePath('/kpi/assignments')
  return { success: true }
}

export async function deleteAssignment(id: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถจัดการ Assignment ได้' }

  const supabase = createServerSupabase()

  const { error } = await supabase.from('kpi_assignments').delete().eq('id', id)

  if (error) {
    console.error(error)
    return { error: 'ลบ Assignment ไม่สำเร็จ' }
  }

  await logActivity('DELETE_KPI_ASSIGNMENT', { id })
  revalidatePath('/kpi/assignments')
  return { success: true }
}

// ============================================================================
// KPI Evaluations — ประเมินผล
// ============================================================================

export async function submitEvaluation(formData: FormData) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถประเมินผลได้' }

  const supabase = createServerSupabase()

  const assignment_id = formData.get('assignment_id') as string
  const score = Number(formData.get('score')) || 0
  const actual_value = Number(formData.get('actual_value')) || 0
  const comment = formData.get('comment') as string
  const evaluation_date = formData.get('evaluation_date') as string
  const period_label = formData.get('period_label') as string

  // Fetch target from assignment to calculate difference & achievement %
  let difference: number | null = null
  let achievement_pct: number | null = null

  const { data: assignment } = await supabase
    .from('kpi_assignments')
    .select('target')
    .eq('id', assignment_id)
    .single()

  if (assignment?.target && assignment.target !== 0) {
    difference = actual_value - assignment.target
    achievement_pct = Math.round((actual_value / assignment.target) * 1000) / 10 // 1 decimal
  }

  const { error } = await supabase.from('kpi_evaluations').insert({
    assignment_id,
    score,
    actual_value,
    difference,
    achievement_pct,
    comment,
    evaluation_date,
    period_label,
    evaluated_by: userId,
  } as any)

  if (error) {
    console.error(error)
    return { error: 'บันทึกผลประเมินไม่สำเร็จ' }
  }

  await logActivity('SUBMIT_KPI_EVALUATION', { assignment_id, score, actual_value, difference, achievement_pct })
  revalidatePath('/kpi/evaluate')
  revalidatePath('/kpi/reports')
  revalidatePath('/kpi/dashboard')
  return { success: true }
}

export async function updateEvaluation(id: string, data: Record<string, unknown>) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const supabase = createServerSupabase()

  const { error } = await supabase.from('kpi_evaluations').update(data as any).eq('id', id)

  if (error) {
    console.error(error)
    return { error: 'แก้ไขผลประเมินไม่สำเร็จ' }
  }

  await logActivity('UPDATE_KPI_EVALUATION', { id, ...data })
  revalidatePath('/kpi/evaluate')
  revalidatePath('/kpi/reports')
  revalidatePath('/kpi/dashboard')
  return { success: true }
}

export async function deleteEvaluation(id: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const supabase = createServerSupabase()

  const { error } = await supabase.from('kpi_evaluations').delete().eq('id', id)

  if (error) {
    console.error(error)
    return { error: 'ลบผลประเมินไม่สำเร็จ' }
  }

  await logActivity('DELETE_KPI_EVALUATION', { id })
  revalidatePath('/kpi/evaluate')
  revalidatePath('/kpi/reports')
  revalidatePath('/kpi/dashboard')
  return { success: true }
}
