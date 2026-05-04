'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

// ─── Session helper (mirrors actions.ts) ───────────────────────
async function getSession() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value || 'staff'
  return { userId, role }
}

// ─── Types & helpers ───────────────────────────────────────────

export type LeaveType = 'personal' | 'sick' | 'vacation'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveRecord {
  id: string
  user_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  total_days: number
  reason: string | null
  attachment_url: string | null
  status: LeaveStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
  profiles?: { id: string; full_name: string | null; nickname: string | null } | null
  reviewer?: { id: string; full_name: string | null; nickname: string | null } | null
}

// Inclusive day count between two ISO dates (YYYY-MM-DD).
function daysBetween(startISO: string, endISO: string): number {
  const start = new Date(startISO + 'T00:00:00')
  const end = new Date(endISO + 'T00:00:00')
  const diffMs = end.getTime() - start.getTime()
  return Math.floor(diffMs / 86_400_000) + 1
}

async function uploadLeaveAttachment(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  leaveId: string,  
  photoBase64: string
): Promise<string | null> {
  try {
    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    const filePath = `${userId}/${leaveId}.webp`
    const { error } = await supabase.storage
      .from('checkin-photos')
      .upload(filePath, buffer, { contentType: 'image/webp', upsert: true })
    if (error) { console.error('Leave attachment upload error:', error); return null }
    const { data } = supabase.storage.from('checkin-photos').getPublicUrl(filePath)
    return data.publicUrl
  } catch (err) {
    console.error('Leave attachment exception:', err)
    return null
  }
}

// ─── Create new leave request ─────────────────────────────────

export async function requestLeave(formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const leaveType = formData.get('leave_type') as LeaveType
  const startDate = formData.get('start_date') as string
  const endDate = formData.get('end_date') as string
  const reason = (formData.get('reason') as string || '').trim()
  const halfDay = formData.get('half_day') === 'true'
  const photoBase64 = formData.get('attachment') as string || null

  if (!leaveType || !['personal', 'sick', 'vacation'].includes(leaveType)) {
    return { error: 'กรุณาเลือกประเภทการลา' }
  }
  if (!startDate || !endDate) return { error: 'กรุณาระบุวันที่' }
  if (endDate < startDate) return { error: 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม' }
  if (!reason && leaveType !== 'vacation') {
    return { error: 'กรุณาระบุเหตุผล' }
  }

  const days = daysBetween(startDate, endDate)
  // Half-day only valid for single-day requests
  const totalDays = halfDay && days === 1 ? 0.5 : days

  const supabase = createServiceClient()

  // Block overlapping pending/approved leaves so the user can't double-book
  const { data: overlap } = await supabase
    .from('leave_requests')
    .select('id, start_date, end_date, status')
    .eq('user_id', userId)
    .in('status', ['pending', 'approved'])
    .lte('start_date', endDate)
    .gte('end_date', startDate)
    .limit(1)
  if (overlap && overlap.length > 0) {
    return { error: 'มีคำขอลาที่ทับซ้อนกับช่วงวันที่นี้อยู่แล้ว' }
  }

  const { data: inserted, error } = await supabase
    .from('leave_requests')
    .insert({
      user_id: userId,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      total_days: totalDays,
      reason: reason || null,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    console.error('Create leave error:', error)
    return { error: error?.message || 'บันทึกไม่สำเร็จ' }
  }

  // Optional attachment (medical certificate for sick leave)
  if (photoBase64) {
    const url = await uploadLeaveAttachment(supabase, userId, inserted.id, photoBase64)
    if (url) {
      await supabase.from('leave_requests').update({ attachment_url: url }).eq('id', inserted.id)
    }
  }

  revalidatePath('/check-in')
  return { ok: true, id: inserted.id }
}

// ─── Cancel a pending request (user can cancel own) ────────────

export async function cancelLeave(id: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { data: row } = await supabase
    .from('leave_requests')
    .select('user_id, status')
    .eq('id', id)
    .single()
  if (!row) return { error: 'ไม่พบคำขอ' }
  if (row.user_id !== userId) return { error: 'ไม่ใช่คำขอของคุณ' }
  if (row.status !== 'pending') return { error: 'ยกเลิกได้เฉพาะคำขอที่ยังรออนุมัติ' }

  const { error } = await supabase
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/check-in')
  return { ok: true }
}

// ─── Admin: approve / reject ───────────────────────────────────

export async function reviewLeave(formData: FormData) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะ admin เท่านั้น' }

  const id = formData.get('id') as string
  const decision = formData.get('decision') as 'approved' | 'rejected'
  const note = (formData.get('note') as string || '').trim() || null

  if (!id || !['approved', 'rejected'].includes(decision)) {
    return { error: 'พารามิเตอร์ไม่ถูกต้อง' }
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('leave_requests')
    .update({
      status: decision,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      review_note: note,
    })
    .eq('id', id)
    .eq('status', 'pending')  // only act on pending rows

  if (error) return { error: error.message }
  revalidatePath('/check-in')
  return { ok: true }
}

// ─── Read helpers (consumed by page.tsx) ───────────────────────

export async function getMyLeaves(): Promise<LeaveRecord[]> {
  const { userId } = await getSession()
  if (!userId) return []
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*, reviewer:reviewed_by(id, full_name, nickname)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) { console.error('getMyLeaves error:', error); return [] }
  return (data || []) as unknown as LeaveRecord[]
}

export async function getPendingLeaves(): Promise<LeaveRecord[]> {
  const { role } = await getSession()
  if (role !== 'admin') return []
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*, profiles:user_id(id, full_name, nickname)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) { console.error('getPendingLeaves error:', error); return [] }
  return (data || []) as unknown as LeaveRecord[]
}
