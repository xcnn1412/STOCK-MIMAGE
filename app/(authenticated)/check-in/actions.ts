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
  const checkoutTime = formData.get('checkout_time') as string || null // HH:mm (optional)
  const note = formData.get('note') as string || null

  if (!targetUserId) return { error: 'กรุณาเลือกพนักงาน' }
  if (!checkinDate) return { error: 'กรุณาเลือกวันที่' }
  if (!checkinTime) return { error: 'กรุณาเลือกเวลา' }

  const supabase = createServiceClient()

  // Build timestamp from date + time in Bangkok timezone
  const checkedInAt = new Date(`${checkinDate}T${checkinTime}:00+07:00`).toISOString()

  // Build checkout timestamp if provided
  let checkedOutAt: string | null = null
  if (checkoutTime) {
    checkedOutAt = new Date(`${checkinDate}T${checkoutTime}:00+07:00`).toISOString()
    // Validate checkout is after checkin
    if (new Date(checkedOutAt) <= new Date(checkedInAt)) {
      return { error: 'เวลาออกต้องหลังเวลาเข้า' }
    }
  }

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

  const { data: inserted, error } = await supabase
    .from('staff_checkins')
    .insert({
      user_id: targetUserId,
      check_type: checkType,
      event_id: resolvedEventId,
      checked_in_at: checkedInAt,
      checked_out_at: checkedOutAt,
      note: note ? `[Admin] ${note}` : `[Admin] สร้างโดย Admin`,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Admin check-in error:', error)
    return { error: 'เกิดข้อผิดพลาดในการ Check-in' }
  }

  // Auto-create expense claim if on-site with checkout
  if (checkedOutAt && checkType === 'onsite' && resolvedEventId && inserted?.id) {
    await autoCreateExpenseFromCheckin(supabase, inserted.id, targetUserId, resolvedEventId)
  }

  revalidatePath('/check-in')
  return { success: true }
}

// ─── Auto-create Expense Claim from On-site Check-out ──────

async function autoCreateExpenseFromCheckin(
  supabase: ReturnType<typeof createServiceClient>,
  checkinId: string,
  userId: string,
  eventId: string
) {
  try {
    // 1. ป้องกันสร้างซ้ำ
    const { data: existing } = await supabase
      .from('expense_claims')
      .select('id')
      .eq('from_checkin_id', checkinId)
      .maybeSingle()

    if (existing) return // already created

    // 2. ดึงข้อมูล Event
    const { data: event } = await supabase
      .from('events')
      .select('id, name, event_date, crm_lead_id')
      .eq('id', eventId)
      .single()

    if (!event) return

    // 3. หา/สร้าง job_cost_events record (auto-import)
    let jobEventId: string | null = null
    const { data: existingJce } = await supabase
      .from('job_cost_events')
      .select('id')
      .eq('source_event_id', eventId)
      .maybeSingle()

    if (existingJce) {
      jobEventId = existingJce.id
    } else {
      // Auto-import via costs module
      const { importEventFromStock } = await import('../costs/actions')
      const importResult = await importEventFromStock(eventId)
      if (importResult.error) {
        jobEventId = (importResult as any).existingId || null
      } else {
        jobEventId = importResult.id || null
      }
    }

    // 4. ดึง Staff Roles (ทีมงาน & หน้าที่)
    const rolesSet = new Set<string>()

    const { data: eStaff } = await supabase
      .from('event_staff')
      .select('role')
      .eq('event_id', eventId)
      .eq('user_id', userId)

    eStaff?.forEach(e => rolesSet.add(e.role))

    if (event.crm_lead_id) {
      const { data: cStaff } = await supabase
        .from('crm_lead_staff')
        .select('role')
        .eq('lead_id', event.crm_lead_id)
        .eq('user_id', userId)

      cStaff?.forEach(c => rolesSet.add(c.role))
    }

    // แปลง role values → labels (Thai) + structured data
    let staffRolesData: { role: string; label: string }[] = []
    if (rolesSet.size > 0) {
      const { data: settings } = await supabase
        .from('crm_settings')
        .select('value, label_th')
        .eq('category', 'staff_role')
        .in('value', Array.from(rolesSet))

      staffRolesData = settings?.map(s => ({ role: s.value, label: s.label_th || s.value })) || 
        Array.from(rolesSet).map(r => ({ role: r, label: r }))
    }


    // 5. Generate claim number
    const now = new Date()
    const prefix = `EXP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const { count } = await supabase
      .from('expense_claims')
      .select('id', { count: 'exact', head: true })
      .like('claim_number', `${prefix}%`)
    const seq = (count || 0) + 1
    const claimNumber = `${prefix}-${String(seq).padStart(3, '0')}`

    // 6. ดึงข้อมูลธนาคารของ staff
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, bank_name, bank_account_number, account_holder_name')
      .eq('id', userId)
      .single()

    const eventName = event.name.length > 60 ? event.name.substring(0, 60) + '...' : event.name

    // 7. สร้างใบเบิก
    await supabase.from('expense_claims').insert({
      claim_number: claimNumber,
      claim_type: 'event',
      job_event_id: jobEventId,
      title: `ค่าสตาฟ - ${eventName}`,
      category: 'staff',
      amount: 0,
      unit_price: 0,
      unit: 'บาท',
      quantity: 1,
      expense_date: event.event_date || now.toISOString().split('T')[0],
      vat_mode: 'none',
      include_vat: false,
      withholding_tax_rate: 0,
      notes: null,
      staff_roles: staffRolesData.length > 0 ? staffRolesData : null,
      submitted_by: userId,
      from_checkin_id: checkinId,
      status: 'pending',
      bank_name: profile?.bank_name || null,
      bank_account_number: profile?.bank_account_number || null,
      account_holder_name: profile?.account_holder_name || null,
    })
  } catch (err) {
    console.error('Auto-create expense from checkin error:', err)
    // ไม่ throw — ไม่ให้กระทบ check-out flow
  }
}

// ─── Check-out ────────────────────────────────────────────

export async function checkOut(formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const checkinId = formData.get('checkin_id') as string
  const photoBase64 = formData.get('photo') as string || null

  if (!checkinId) return { error: 'ไม่พบ record' }
  if (!photoBase64) return { error: 'กรุณาถ่ายรูป Check-out' }

  const supabase = createServiceClient()

  // Upload checkout photo
  let checkoutPhotoUrl: string | null = null
  if (photoBase64) {
    checkoutPhotoUrl = await uploadCheckinPhoto(supabase, userId, `${checkinId}_out`, photoBase64)
  }

  const { error } = await supabase
    .from('staff_checkins')
    .update({
      checked_out_at: new Date().toISOString(),
      checkout_photo_url: checkoutPhotoUrl,
    })
    .eq('id', checkinId)
    .eq('user_id', userId)

  if (error) {
    console.error('Check-out error:', error)
    return { error: 'เกิดข้อผิดพลาดในการ Check-out' }
  }

  // Auto-create expense claim สำหรับงาน on-site
  const { data: checkinRecord } = await supabase
    .from('staff_checkins')
    .select('check_type, event_id')
    .eq('id', checkinId)
    .single()

  if (checkinRecord?.check_type === 'onsite' && checkinRecord.event_id) {
    await autoCreateExpenseFromCheckin(supabase, checkinId, userId, checkinRecord.event_id)
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
    .select('*, profiles:user_id(id, full_name, nickname), events:event_id(id, name), photo_url, checkout_photo_url')
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
    .select('*, events:event_id(id, name), photo_url, checkout_photo_url')
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
  const { userId, role } = await getSession()
  if (!userId) return []

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
    .select('id, name, event_date, location, status, crm_lead_id')
    .gte('event_date', yesterday)
    .lte('event_date', tomorrow)
    .in('status', ['upcoming', 'ongoing'])
    .order('event_date', { ascending: true })

  if (!data || data.length === 0) return []

  // Fetch all staff setting mappings for nice labels/colors
  const { data: settingsData } = await supabase.from('crm_settings').select('value, label_th, color').eq('category', 'staff_role')
  const roleMap: Record<string, { label: string, color: string }> = {}
  settingsData?.forEach(s => {
    roleMap[s.value] = { label: s.label_th, color: s.color || '#6b7280' }
  })

  // Find assignments for this user to get their roles
  const [{ data: eStaff }, { data: cStaff }] = await Promise.all([
    supabase.from('event_staff').select('event_id, role').eq('user_id', userId),
    supabase.from('crm_lead_staff').select('lead_id, role').eq('user_id', userId),
  ])

  const eStaffRoles = new Map<string, string[]>()
  eStaff?.forEach(e => {
    if (!eStaffRoles.has(e.event_id)) eStaffRoles.set(e.event_id, [])
    eStaffRoles.get(e.event_id)!.push(e.role)
  })

  const cStaffRoles = new Map<string, string[]>()
  cStaff?.forEach(c => {
    if (!cStaffRoles.has(c.lead_id)) cStaffRoles.set(c.lead_id, [])
    cStaffRoles.get(c.lead_id)!.push(c.role)
  })

  // Map events to attach roles nicely
  const mappedEvents = data.map(ev => {
    const rolesSet = new Set<string>()
    if (eStaffRoles.has(ev.id)) {
      eStaffRoles.get(ev.id)!.forEach(r => rolesSet.add(r))
    }
    if (ev.crm_lead_id && cStaffRoles.has(ev.crm_lead_id)) {
      cStaffRoles.get(ev.crm_lead_id)!.forEach(r => rolesSet.add(r))
    }

    const assigned_roles = Array.from(rolesSet).map(r => ({
      role: r,
      label: roleMap[r]?.label || r,
      color: roleMap[r]?.color || '#6b7280'
    }))

    return { ...ev, assigned_roles }
  })

  // If user is admin/owner, they can see all events (but they still get their role attached if applicable)
  if (role === 'admin' || role === 'owner') {
    return mappedEvents
  }

  // Filter events: non-admin must be assigned either directly or via CRM
  const allowedEvents = mappedEvents.filter(ev => ev.assigned_roles.length > 0)

  return allowedEvents
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
      .select('id, user_id, check_type, checked_in_at, checked_out_at, note, latitude, longitude, photo_url, checkout_photo_url, event_id, events:event_id(id, name, crm_lead_id), profiles:user_id(id, full_name, nickname)')
      .gte('checked_in_at', startISO)
      .lte('checked_in_at', endISO)
      .order('checked_in_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, nickname, standard_hours, late_hour, late_minute, ot_threshold')
      .order('full_name'),
  ])

  const records = recordsResult.data || []
  if (records.length === 0) return { records: [], staff: staffResult.data || [] }

  const eventIds = Array.from(new Set(records.map(r => r.event_id).filter(Boolean))) as string[]
  const leadIds = Array.from(new Set(records.map(r => (r.events as any)?.crm_lead_id).filter(Boolean))) as string[]

  const [{ data: eStaff }, { data: cStaff }, { data: settingsData }] = await Promise.all([
    eventIds.length > 0 ? supabase.from('event_staff').select('event_id, user_id, role').in('event_id', eventIds) : { data: [] },
    leadIds.length > 0 ? supabase.from('crm_lead_staff').select('lead_id, user_id, role').in('lead_id', leadIds) : { data: [] },
    supabase.from('crm_settings').select('value, label_th, color').eq('category', 'staff_role')
  ])

  const roleMap: Record<string, { label: string, color: string }> = {}
  settingsData?.forEach(s => {
    roleMap[s.value] = { label: s.label_th, color: s.color || '#6b7280' }
  })

  const eRoleMap = new Map<string, string[]>()
  eStaff?.forEach(e => {
    const key = `${e.event_id}_${e.user_id}`
    if (!eRoleMap.has(key)) eRoleMap.set(key, [])
    eRoleMap.get(key)!.push(e.role)
  })

  const cRoleMap = new Map<string, string[]>()
  cStaff?.forEach(c => {
    const key = `${c.lead_id}_${c.user_id}`
    if (!cRoleMap.has(key)) cRoleMap.set(key, [])
    cRoleMap.get(key)!.push(c.role)
  })

  const mappedRecords = records.map(r => {
    const rolesSet = new Set<string>()
    if (r.event_id) {
      const eKey = `${r.event_id}_${r.user_id}`
      if (eRoleMap.has(eKey)) eRoleMap.get(eKey)!.forEach(role => rolesSet.add(role))

      const leadId = (r.events as any)?.crm_lead_id
      if (leadId) {
        const cKey = `${leadId}_${r.user_id}`
        if (cRoleMap.has(cKey)) cRoleMap.get(cKey)!.forEach(role => rolesSet.add(role))
      }
    }

    const assigned_roles = Array.from(rolesSet).map(role => ({
      role,
      label: roleMap[role]?.label || role,
      color: roleMap[role]?.color || '#6b7280'
    }))

    return { ...r, assigned_roles }
  })

  return {
    records: mappedRecords,
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
