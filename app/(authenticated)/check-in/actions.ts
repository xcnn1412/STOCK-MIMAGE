'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

async function getSession() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value || 'staff'
  return { userId, role }
}

// ─── Upload Check-in Photo ────────────────────────────────

async function uploadCheckinPhoto(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  checkinId: string,
  photoBase64: string
): Promise<string | null> {
  try {
    // Strip data URL prefix if present
    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    const filePath = `${userId}/${checkinId}.webp`

    const { error: uploadError } = await supabase.storage
      .from('checkin-photos')
      .upload(filePath, buffer, {
        contentType: 'image/webp',
        upsert: true,
      })

    if (uploadError) {
      console.error('Photo upload error:', uploadError)
      return null
    }

    const { data: urlData } = supabase.storage
      .from('checkin-photos')
      .getPublicUrl(filePath)

    return urlData.publicUrl
  } catch (err) {
    console.error('Photo upload exception:', err)
    return null
  }
}

// ─── Quick Check-in (ตัวเอง วันนี้) ───────────────────────

export async function checkIn(formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const checkType = formData.get('check_type') as string || 'office'
  const eventId = formData.get('event_id') as string || null
  const latitude = formData.get('latitude') ? Number(formData.get('latitude')) : null
  const longitude = formData.get('longitude') ? Number(formData.get('longitude')) : null
  const accuracy = formData.get('accuracy') ? Number(formData.get('accuracy')) : null
  const note = formData.get('note') as string || null
  const photoBase64 = formData.get('photo') as string || null

  if (!photoBase64) {
    return { error: 'กรุณาถ่ายรูป Check-in' }
  }
  if (checkType === 'remote' && !note) {
    return { error: 'กรุณาระบุหมายเหตุสำหรับการทำงานนอกสถานที่' }
  }
  if (checkType === 'onsite' && !eventId) {
    return { error: 'กรุณาเลือกอีเวนต์' }
  }

  const supabase = createServiceClient()

  const { data: inserted, error } = await supabase
    .from('staff_checkins')
    .insert({
      user_id: userId,
      check_type: checkType,
      event_id: checkType === 'onsite' ? eventId : null,
      latitude,
      longitude,
      accuracy,
      note,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { error: 'คุณ Check-in ไปแล้ววันนี้' }
    }
    console.error('Check-in error:', error)
    return { error: 'เกิดข้อผิดพลาดในการ Check-in' }
  }

  // Upload photo if provided
  if (photoBase64 && inserted?.id) {
    const photoUrl = await uploadCheckinPhoto(supabase, userId, inserted.id, photoBase64)
    if (photoUrl) {
      await supabase
        .from('staff_checkins')
        .update({ photo_url: photoUrl })
        .eq('id', inserted.id)
    }
  }

  revalidatePath('/check-in')
  return { success: true }
}

// ─── Admin Check-in ย้อนหลัง ──────────────────────────────

export async function adminCheckIn(formData: FormData) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'Unauthorized' }

  const targetUserId = formData.get('target_user_id') as string
  const checkType = formData.get('check_type') as string || 'office'
  const rawEventId = formData.get('event_id') as string || null
  const checkinDate = formData.get('checkin_date') as string // YYYY-MM-DD
  const checkinTime = formData.get('checkin_time') as string // HH:mm
  const note = formData.get('note') as string || null

  if (!targetUserId) return { error: 'กรุณาเลือกพนักงาน' }
  if (!checkinDate) return { error: 'กรุณาเลือกวันที่' }
  if (!checkinTime) return { error: 'กรุณาเลือกเวลา' }

  const supabase = createServiceClient()

  // Build timestamp from date + time in Bangkok timezone
  const checkedInAt = new Date(`${checkinDate}T${checkinTime}:00+07:00`).toISOString()

  // Resolve event_id from prefixed format (stock:uuid, closure:uuid, or raw uuid)
  let resolvedEventId: string | null = null
  if (checkType === 'onsite' && rawEventId) {
    if (rawEventId.startsWith('stock:')) {
      resolvedEventId = rawEventId.replace('stock:', '')
    } else if (rawEventId.startsWith('closure:')) {
      resolvedEventId = null // closure records don't FK to events
    } else {
      // job_cost_events ID — lookup source_event_id
      const { data: jce } = await supabase
        .from('job_cost_events')
        .select('source_event_id')
        .eq('id', rawEventId)
        .single()
      resolvedEventId = jce?.source_event_id || null
    }
  }

  const { error } = await supabase
    .from('staff_checkins')
    .insert({
      user_id: targetUserId,
      check_type: checkType,
      event_id: resolvedEventId,
      checked_in_at: checkedInAt,
      note: note ? `[Admin] ${note}` : `[Admin] สร้างโดย Admin`,
    })

  if (error) {
    if (error.code === '23505') {
      return { error: 'พนักงานคนนี้ Check-in ไปแล้วในวันที่เลือก' }
    }
    console.error('Admin check-in error:', error)
    return { error: 'เกิดข้อผิดพลาดในการ Check-in' }
  }

  revalidatePath('/check-in')
  return { success: true }
}

// ─── Check-out ────────────────────────────────────────────

export async function checkOut(checkinId: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('staff_checkins')
    .update({ checked_out_at: new Date().toISOString() })
    .eq('id', checkinId)
    .eq('user_id', userId)

  if (error) {
    console.error('Check-out error:', error)
    return { error: 'เกิดข้อผิดพลาดในการ Check-out' }
  }

  revalidatePath('/check-in')
  return { success: true }
}

// ─── Undo Check-out (ภายใน 5 นาที) ───────────────────────

export async function undoCheckout(checkinId: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // Fetch the record first to verify ownership and time
  const { data: record } = await supabase
    .from('staff_checkins')
    .select('id, user_id, checked_out_at')
    .eq('id', checkinId)
    .eq('user_id', userId)
    .single()

  if (!record) return { error: 'ไม่พบ record' }
  if (!record.checked_out_at) return { error: 'ยังไม่ได้ Check-out' }

  // Check if within 5 minutes
  const checkoutTime = new Date(record.checked_out_at).getTime()
  const now = Date.now()
  const fiveMinutes = 5 * 60 * 1000
  if (now - checkoutTime > fiveMinutes) {
    return { error: 'เกิน 5 นาทีแล้ว — กรุณาติดต่อ Admin' }
  }

  const { error } = await supabase
    .from('staff_checkins')
    .update({ checked_out_at: null })
    .eq('id', checkinId)
    .eq('user_id', userId)

  if (error) {
    console.error('Undo checkout error:', error)
    return { error: 'เกิดข้อผิดพลาด' }
  }

  revalidatePath('/check-in')
  return { success: true }
}

// ─── Admin: ลบ Check-in ──────────────────────────────────

export async function adminDeleteCheckin(checkinId: string) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('staff_checkins')
    .delete()
    .eq('id', checkinId)

  if (error) {
    console.error('Admin delete error:', error)
    return { error: 'เกิดข้อผิดพลาดในการลบ' }
  }

  revalidatePath('/check-in')
  return { success: true }
}

// ─── Admin: แก้ไข Check-in ───────────────────────────────

export async function adminEditCheckin(formData: FormData) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'Unauthorized' }

  const checkinId = formData.get('checkin_id') as string
  const checkType = formData.get('check_type') as string | null
  const note = formData.get('note') as string | null
  const clearCheckout = formData.get('clear_checkout') === 'true'

  if (!checkinId) return { error: 'ไม่พบ record' }

  const supabase = createServiceClient()

  const updates: Record<string, unknown> = {}
  if (checkType) updates.check_type = checkType
  if (note !== null) updates.note = note
  if (clearCheckout) updates.checked_out_at = null

  if (Object.keys(updates).length === 0) return { error: 'ไม่มีข้อมูลที่จะแก้ไข' }

  const { error } = await supabase
    .from('staff_checkins')
    .update(updates)
    .eq('id', checkinId)

  if (error) {
    console.error('Admin edit error:', error)
    return { error: 'เกิดข้อผิดพลาดในการแก้ไข' }
  }

  revalidatePath('/check-in')
  return { success: true }
}

// ─── Queries ──────────────────────────────────────────────

export async function getTodayCheckins() {
  const supabase = createServiceClient()

  const now = new Date()
  const bangkokOffset = 7 * 60 * 60 * 1000
  const bangkokNow = new Date(now.getTime() + bangkokOffset)
  const todayStr = bangkokNow.toISOString().split('T')[0]

  const startOfDay = new Date(`${todayStr}T00:00:00+07:00`).toISOString()
  const endOfDay = new Date(`${todayStr}T23:59:59+07:00`).toISOString()

  const { data, error } = await supabase
    .from('staff_checkins')
    .select('*, profiles:user_id(id, full_name, nickname), events:event_id(id, name), photo_url')
    .gte('checked_in_at', startOfDay)
    .lte('checked_in_at', endOfDay)
    .order('checked_in_at', { ascending: true })

  if (error) {
    console.error('Get today checkins error:', error)
    return []
  }

  return data || []
}

export async function getMyCheckinHistory(limit = 30) {
  const { userId } = await getSession()
  if (!userId) return []

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('staff_checkins')
    .select('*, events:event_id(id, name), photo_url')
    .eq('user_id', userId)
    .order('checked_in_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Get history error:', error)
    return []
  }

  return data || []
}

export async function getTodayEvents() {
  const supabase = createServiceClient()

  const now = new Date()
  const bangkokOffset = 7 * 60 * 60 * 1000
  const bangkokNow = new Date(now.getTime() + bangkokOffset)
  const todayStr = bangkokNow.toISOString().split('T')[0]

  // Events within ±1 day
  const yesterday = new Date(new Date(todayStr).getTime() - 86400000).toISOString().split('T')[0]
  const tomorrow = new Date(new Date(todayStr).getTime() + 86400000).toISOString().split('T')[0]

  const { data } = await supabase
    .from('events')
    .select('id, name, event_date, location, status')
    .gte('event_date', yesterday)
    .lte('event_date', tomorrow)
    .in('status', ['upcoming', 'ongoing'])
    .order('event_date', { ascending: true })

  return data || []
}

export async function getStaffList() {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, nickname')
    .order('full_name')

  return data || []
}

// ─── Report Data (Admin Only) ─────────────────────────────

export async function getCheckinReportData(startDate: string, endDate: string) {
  const { role } = await getSession()
  if (role !== 'admin') return { records: [], staff: [] }

  const supabase = createServiceClient()

  const startISO = new Date(`${startDate}T00:00:00+07:00`).toISOString()
  const endISO = new Date(`${endDate}T23:59:59+07:00`).toISOString()

  const [recordsResult, staffResult] = await Promise.all([
    supabase
      .from('staff_checkins')
      .select('id, user_id, check_type, checked_in_at, checked_out_at, note, latitude, longitude, photo_url, event_id, events:event_id(id, name), profiles:user_id(id, full_name, nickname)')
      .gte('checked_in_at', startISO)
      .lte('checked_in_at', endISO)
      .order('checked_in_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, nickname, standard_hours, late_hour, late_minute, ot_threshold')
      .order('full_name'),
  ])

  return {
    records: recordsResult.data || [],
    staff: staffResult.data || [],
  }
}

// ─── Update Staff Work Settings (Admin Only) ──────────────

export async function updateStaffWorkSettings(
  staffId: string,
  settings: {
    standard_hours: number | null
    late_hour: number | null
    late_minute: number | null
    ot_threshold: number | null
  }
) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'ไม่มีสิทธิ์' }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('profiles')
    .update({
      standard_hours: settings.standard_hours,
      late_hour: settings.late_hour,
      late_minute: settings.late_minute,
      ot_threshold: settings.ot_threshold,
    })
    .eq('id', staffId)

  if (error) {
    console.error('Update staff work settings error:', error)
    return { error: 'เกิดข้อผิดพลาด' }
  }

  revalidatePath('/check-in/report')
  return { success: true }
}
