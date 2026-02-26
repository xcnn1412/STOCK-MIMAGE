'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.types'


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

  const supabase = createServiceClient()

  const name = formData.get('name') as string
  const mode = formData.get('mode') as string
  const description = formData.get('description') as string
  const default_target = Number(formData.get('default_target')) || 0
  const target_unit = (formData.get('target_unit') as string) || ''
  const configRaw = formData.get('config') as string
  let config: Record<string, unknown> = {}
  try {
    config = configRaw ? JSON.parse(configRaw) : {}
    if (typeof config !== 'object' || config === null) config = {}
  } catch { config = {} }

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

  const supabase = createServiceClient()

  const name = formData.get('name') as string
  const mode = formData.get('mode') as string
  const description = formData.get('description') as string
  const default_target = Number(formData.get('default_target')) || 0
  const target_unit = (formData.get('target_unit') as string) || ''
  const configRaw = formData.get('config') as string
  let config: Record<string, unknown> = {}
  try {
    config = configRaw ? JSON.parse(configRaw) : {}
    if (typeof config !== 'object' || config === null) config = {}
  } catch { config = {} }

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

  const supabase = createServiceClient()

  // Check for linked assignments
  const { count } = await supabase
    .from('kpi_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', id)

  if (count && count > 0) {
    return { error: `ไม่สามารถลบ Template ได้ เนื่องจากมี Assignment ที่ผูกอยู่ ${count} รายการ — กรุณาลบ Assignment ก่อน` }
  }

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

  const supabase = createServiceClient()

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
  let custom_config: Record<string, unknown> | null = null
  try {
    custom_config = custom_config_raw ? JSON.parse(custom_config_raw) : null
    if (custom_config && (typeof custom_config !== 'object')) custom_config = null
  } catch { custom_config = null }

  const weight = Math.max(0, Math.min(100, Number(formData.get('weight')) || 0))

  // ─── 1 record = 1 เดือน ─── (ไม่ต้องใช้ monthly_targets JSONB แล้ว)
  const insertData: Record<string, unknown> = {
    assigned_to,
    target,
    target_unit,
    cycle,
    period_start,
    period_end,
    weight,
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

  await logActivity('CREATE_KPI_ASSIGNMENT', { assigned_to, template_id, custom_name, period_start })
  revalidatePath('/kpi/assignments')
  return { success: true }
}

export async function updateAssignment(id: string, data: Record<string, unknown>) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถจัดการ Assignment ได้' }

  const supabase = createServiceClient()

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

  const supabase = createServiceClient()

  // Check for linked evaluations
  const { count } = await supabase
    .from('kpi_evaluations')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', id)

  if (count && count > 0) {
    return { error: `ไม่สามารถลบ Assignment ได้ เนื่องจากมีผลประเมินที่ผูกอยู่ ${count} รายการ — กรุณาลบผลประเมินก่อน` }
  }

  const { error } = await supabase.from('kpi_assignments').delete().eq('id', id)

  if (error) {
    console.error(error)
    return { error: 'ลบ Assignment ไม่สำเร็จ' }
  }

  await logActivity('DELETE_KPI_ASSIGNMENT', { id })
  revalidatePath('/kpi/assignments')
  return { success: true }
}

export async function updateAssignmentWeight(id: string, newWeight: number) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const supabase = createServiceClient()
  const weight = Math.max(0, Math.min(100, newWeight))

  // Fetch this assignment to get the person
  const { data: assignment } = await supabase
    .from('kpi_assignments')
    .select('assigned_to, weight')
    .eq('id', id)
    .single() as { data: { assigned_to: string; weight: number } | null }

  if (!assignment) return { error: 'ไม่พบ Assignment' }

  // Check total weight for person (excluding current assignment)
  const { data: otherAssignments } = await supabase
    .from('kpi_assignments')
    .select('weight')
    .eq('assigned_to', assignment.assigned_to)
    .neq('id', id)

  const othersTotal = (otherAssignments || []).reduce(
    (sum, a) => sum + ((a as any).weight ?? 0), 0
  )

  if (othersTotal + weight > 100) {
    const remaining = Math.max(0, 100 - othersTotal)
    return { error: `น้ำหนักรวมจะเกิน 100% — เหลือได้อีก ${remaining}%` }
  }

  const { error } = await supabase
    .from('kpi_assignments')
    .update({ weight } as any)
    .eq('id', id)

  if (error) {
    console.error(error)
    return { error: 'อัปเดตน้ำหนักไม่สำเร็จ' }
  }

  await logActivity('UPDATE_KPI_ASSIGNMENT', { id, weight })
  revalidatePath('/kpi/assignments')
  return { success: true }
}

// ============================================================================
// KPI Evaluations — ประเมินผล
// ============================================================================

export async function submitEvaluation(formData: FormData) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถประเมินผลได้' }

  const supabase = createServiceClient()

  const assignment_id = formData.get('assignment_id') as string
  const actual_value = Number(formData.get('actual_value')) || 0
  const comment = formData.get('comment') as string
  const evaluation_date = formData.get('evaluation_date') as string
  const period_label = formData.get('period_label') as string

  // Fetch target from assignment — ตอนนี้ 1 record = 1 เดือน, ใช้ target ตรงๆ
  let difference: number | null = null
  let achievement_pct: number | null = null
  let score = 0

  const { data: assignment } = await supabase
    .from('kpi_assignments')
    .select('target')
    .eq('id', assignment_id)
    .single()

  const effectiveTarget = assignment?.target ?? 0

  if (effectiveTarget && effectiveTarget !== 0) {
    difference = actual_value - effectiveTarget
    achievement_pct = Math.round((actual_value / effectiveTarget) * 1000) / 10 // 1 decimal
    // Auto score: clamp achievement_pct to 0-100
    score = Math.min(Math.max(Math.round(achievement_pct), 0), 100)
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

// ─── Self-Evaluation (Staff) ─── 
export async function submitSelfEvaluation(formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'กรุณาเข้าสู่ระบบก่อน' }

  const supabase = createServiceClient()

  const assignment_id = formData.get('assignment_id') as string
  const actual_value = Number(formData.get('actual_value')) || 0
  const comment = formData.get('comment') as string
  const evaluation_date = formData.get('evaluation_date') as string
  const period_label = formData.get('period_label') as string

  // ตรวจสอบว่า assignment เป็นของ user จริง
  const { data: assignment } = await supabase
    .from('kpi_assignments')
    .select('target, assigned_to')
    .eq('id', assignment_id)
    .single()

  if (!assignment) return { error: 'ไม่พบ KPI ที่กำหนด' }
  if (assignment.assigned_to !== userId) return { error: 'คุณไม่มีสิทธิ์ประเมิน KPI นี้' }

  // ตอนนี้ 1 record = 1 เดือน — ใช้ target ตรงจาก assignment
  const effectiveTarget = assignment.target ?? 0

  // คำนวณ difference, achievement %, score อัตโนมัติ
  let difference: number | null = null
  let achievement_pct: number | null = null
  let score = 0

  if (effectiveTarget && effectiveTarget !== 0) {
    difference = actual_value - effectiveTarget
    achievement_pct = Math.round((actual_value / effectiveTarget) * 1000) / 10
    // Auto score: clamp achievement_pct to 0-100
    score = Math.min(Math.max(Math.round(achievement_pct), 0), 100)
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

  await logActivity('SUBMIT_SELF_EVALUATION', { assignment_id, score, actual_value, difference, achievement_pct })
  revalidatePath('/kpi/dashboard')
  revalidatePath('/kpi/evaluate')
  revalidatePath('/kpi/reports')
  return { success: true }
}

export async function updateEvaluation(id: string, data: Record<string, unknown>) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const supabase = createServiceClient()

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

  const supabase = createServiceClient()

  const { error } = await supabase.from('kpi_evaluations').delete().eq('id', id)

  if (error) {
    console.error(error)
    return { error: 'ลบผลประเมินไม่สำเร็จ' }
  }

  await logActivity('DELETE_KPI_EVALUATION', { id })
  revalidatePath('/kpi/evaluate')
  revalidatePath('/kpi/reports')
  revalidatePath('/kpi/dashboard')
  revalidatePath('/kpi/assignments')
  return { success: true }
}

export async function deleteAllEvaluationsByAssignment(assignmentId: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const supabase = createServiceClient()

  const { count } = await supabase
    .from('kpi_evaluations')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', assignmentId)

  if (!count || count === 0) return { error: 'ไม่มีผลประเมินที่จะลบ' }

  const { error } = await supabase
    .from('kpi_evaluations')
    .delete()
    .eq('assignment_id', assignmentId)

  if (error) {
    console.error(error)
    return { error: 'ลบผลประเมินไม่สำเร็จ' }
  }

  await logActivity('DELETE_ALL_KPI_EVALUATIONS', { assignmentId, count })
  revalidatePath('/kpi/evaluate')
  revalidatePath('/kpi/reports')
  revalidatePath('/kpi/dashboard')
  revalidatePath('/kpi/assignments')
  return { success: true, count }
}
