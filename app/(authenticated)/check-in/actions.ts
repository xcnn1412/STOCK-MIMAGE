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

  // Guard: only one active session per check_type at a time.
  // Office / onsite / remote run independently, but you can't have two
  // un-checked-out office sessions (etc.) overlapping.
  //
  // Window-aligned with getTodayCheckins() (7 days). Orphans older than that
  // are auto-closed at end-of-checkin-day so the user isn't permanently
  // blocked by a record they can't see in the UI to check out manually.
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString()

  const { data: existingActive } = await supabase
    .from('staff_checkins')
    .select('id, check_type, event_id, checked_in_at, note')
    .eq('user_id', userId)
    .eq('check_type', checkType)
    .is('checked_out_at', null)

  if (existingActive && existingActive.length > 0) {
    const recent = existingActive.filter(r => r.checked_in_at >= sevenDaysAgo)
    const ancient = existingActive.filter(r => r.checked_in_at < sevenDaysAgo)

    // Auto-close ancient orphans (user can't see/manage them in UI)
    for (const orphan of ancient) {
      const bangkokOffset = 7 * 60 * 60 * 1000
      const checkinDateStr = new Date(new Date(orphan.checked_in_at).getTime() + bangkokOffset)
        .toISOString().split('T')[0]
      const endOfCheckinDay = new Date(`${checkinDateStr}T23:59:59+07:00`).toISOString()
      const autoNote = '[Auto] orphaned >7d'
      const newNote = orphan.note ? `${orphan.note} · ${autoNote}` : autoNote

      await supabase
        .from('staff_checkins')
        .update({ checked_out_at: endOfCheckinDay, note: newNote })
        .eq('id', orphan.id)

      // Trigger expense for onsite orphans (work was done — staff deserves the rate)
      if (orphan.check_type === 'onsite' && orphan.event_id) {
        await autoCreateExpenseFromCheckin(supabase, orphan.id, userId, orphan.event_id)
      }
    }

    // Recent active sessions — block, user can manage them via UI
    if (recent.length > 0) {
      const typeLabel = checkType === 'office' ? 'ออฟฟิศ'
        : checkType === 'onsite' ? 'อีเวนต์'
        : 'นอกสถานที่'
      return { error: `มี Check-in ประเภท "${typeLabel}" ที่ยังไม่ checkout — กรุณา checkout ก่อนเริ่มรอบใหม่` }
    }
  }

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

  // Resolve event_id from prefixed format (stock:uuid, closure:uuid, or raw uuid).
  // When the source can't be FK'd to events (closure / cost-event-without-source),
  // we keep the original ref in `note` as `[ref:closure:UUID]` or `[ref:jce:UUID]`
  // so the report fetcher can still resolve the event name later.
  let resolvedEventId: string | null = null
  let sourceRefTag: string | null = null
  if (checkType === 'onsite' && rawEventId) {
    if (rawEventId.startsWith('stock:')) {
      resolvedEventId = rawEventId.replace('stock:', '')
    } else if (rawEventId.startsWith('closure:')) {
      resolvedEventId = null // closure records don't FK to events
      sourceRefTag = `[ref:${rawEventId}]` // [ref:closure:UUID]
    } else {
      // job_cost_events ID — lookup source_event_id
      const { data: jce } = await supabase
        .from('job_cost_events')
        .select('source_event_id')
        .eq('id', rawEventId)
        .single()
      resolvedEventId = jce?.source_event_id || null
      if (!resolvedEventId) {
        sourceRefTag = `[ref:jce:${rawEventId}]`
      }
    }
  }

  const baseNote = note ? `[Admin] ${note}` : `[Admin] สร้างโดย Admin`
  const finalNote = sourceRefTag ? `${baseNote} ${sourceRefTag}` : baseNote

  const { data: inserted, error } = await supabase
    .from('staff_checkins')
    .insert({
      user_id: targetUserId,
      check_type: checkType,
      event_id: resolvedEventId,
      checked_in_at: checkedInAt,
      checked_out_at: checkedOutAt,
      note: finalNote,
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

    // 5. ดึง Role Settings (rate + auto_calc per role) & Global auto_calc toggle
    const [{ data: roleSettings }, { data: globalSettings }] = await Promise.all([
      supabase
        .from('crm_settings')
        .select('value, label_th, price, auto_calc')
        .eq('category', 'staff_role')
        .in('value', Array.from(rolesSet.size > 0 ? rolesSet : ['__none__'])),
      supabase
        .from('finance_auto_calc_settings')
        .select('key, value')
        .eq('key', 'auto_calc_enabled')
        .maybeSingle(),
    ])

    const globalAutoCalcEnabled = globalSettings?.value === 'true'

    // แปลง role values → labels (Thai) + structured data
    const staffRolesData: { role: string; label: string }[] =
      roleSettings?.map(s => ({ role: s.value, label: s.label_th || s.value })) ||
      Array.from(rolesSet).map(r => ({ role: r, label: r }))

    // 6. คำนวณ rate อัตโนมัติ (ใช้ role ที่ rate สูงสุดและเปิด auto_calc)
    let autoRate = 0
    let autoCalcUsed = false
    let autoCalcRoleName = ''

    if (globalAutoCalcEnabled && roleSettings && roleSettings.length > 0) {
      // หา role ที่ auto_calc = true และ price สูงสุด
      const autoCalcRoles = roleSettings
        .filter(r => r.auto_calc === true && Number(r.price || 0) > 0)
        .sort((a, b) => Number(b.price || 0) - Number(a.price || 0))

      if (autoCalcRoles.length > 0) {
        autoRate = Number(autoCalcRoles[0].price)
        autoCalcUsed = true
        autoCalcRoleName = autoCalcRoles[0].label_th || autoCalcRoles[0].value
      }
    }

    // 7. Generate claim number
    const now = new Date()
    const prefix = `EXP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const { count } = await supabase
      .from('expense_claims')
      .select('id', { count: 'exact', head: true })
      .like('claim_number', `${prefix}%`)
    const seq = (count || 0) + 1
    const claimNumber = `${prefix}-${String(seq).padStart(3, '0')}`

    // 8. ดึงข้อมูลธนาคารของ staff
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, bank_name, bank_account_number, account_holder_name')
      .eq('id', userId)
      .single()

    const eventName = event.name.length > 60 ? event.name.substring(0, 60) + '...' : event.name

    // Auto-calc note
    const autoCalcNote = autoCalcUsed
      ? `[Auto] คำนวณจาก role: ${autoCalcRoleName} (฿${autoRate.toLocaleString()})`
      : null

    // 9. สร้างใบเบิก (ใส่ rate อัตโนมัติถ้าเปิด)
    await supabase.from('expense_claims').insert({
      claim_number: claimNumber,
      claim_type: 'event',
      job_event_id: jobEventId,
      title: `ค่าสตาฟ - ${eventName}`,
      category: 'staff',
      amount: autoRate,
      unit_price: autoRate,
      unit: 'บาท',
      quantity: 1,
      expense_date: event.event_date || now.toISOString().split('T')[0],
      vat_mode: 'none',
      include_vat: false,
      withholding_tax_rate: 0,
      notes: autoCalcNote,
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

// ─── Quick Check-out (ค้างจากวันก่อน — ไม่ต้องใส่รูป) ────
//
// สำหรับเคสลืม check-out จากเมื่อวาน (หรือก่อนหน้า) ที่ถ่ายรูปย้อนหลังไม่
// ทำให้เป็น proof of work ที่ใช้ได้อยู่ดี — ตัด checked_out_at ที่ end-of-day
// 23:59:59 ของวันที่ check-in แล้ว tag note "[Auto] ตัด end-of-day" เพื่อให้
// admin/รายงานเห็นชัดว่า record นี้ปิดโดยระบบ ไม่ใช่ผู้ใช้
//
// Backend gate: อนุญาตเฉพาะ session ที่ "stale" จริงๆ (checked_in_at < วันนี้
// 00:00 Bangkok) เพื่อกัน user ใช้ปุ่มนี้ปิด session วันนี้แบบเลี่ยงรูป

export async function quickCheckoutStale(checkinId: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { data: record } = await supabase
    .from('staff_checkins')
    .select('id, user_id, check_type, event_id, checked_in_at, checked_out_at, note')
    .eq('id', checkinId)
    .eq('user_id', userId)
    .single()

  if (!record) return { error: 'ไม่พบ record' }
  if (record.checked_out_at) return { error: 'Check-out แล้ว' }

  // กัน user ใช้ปุ่มนี้กับ session วันนี้ — ต้องผ่านขั้น check-out + รูปปกติ
  const bangkokOffset = 7 * 60 * 60 * 1000
  const todayStr = new Date(Date.now() + bangkokOffset).toISOString().split('T')[0]
  const checkinDateStr = new Date(new Date(record.checked_in_at).getTime() + bangkokOffset).toISOString().split('T')[0]
  if (checkinDateStr >= todayStr) {
    return { error: 'ใช้ปุ่มนี้ได้เฉพาะ session ที่ค้างจากวันก่อน — กรุณา Check-out ปกติ' }
  }

  // ตัดที่ 23:59:59 ของวันที่ check-in (Bangkok) — สื่อความหมาย "ปิดที่สิ้นวัน"
  const endOfCheckinDay = new Date(`${checkinDateStr}T23:59:59+07:00`).toISOString()

  const autoNote = '[Auto] ตัด end-of-day'
  const newNote = record.note ? `${record.note} · ${autoNote}` : autoNote

  const { error } = await supabase
    .from('staff_checkins')
    .update({
      checked_out_at: endOfCheckinDay,
      note: newNote,
    })
    .eq('id', checkinId)
    .eq('user_id', userId)

  if (error) {
    console.error('Quick checkout error:', error)
    return { error: 'เกิดข้อผิดพลาด' }
  }

  // Auto-create expense claim สำหรับงาน on-site (เหมือน checkOut ปกติ)
  if (record.check_type === 'onsite' && record.event_id) {
    await autoCreateExpenseFromCheckin(supabase, checkinId, userId, record.event_id)
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
  // 7-day cutoff for stale active sessions — anything older is treated as
  // abandoned and not surfaced (admin would need to clean up via override).
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const selectFields = '*, profiles:user_id(id, full_name, nickname), events:event_id(id, name), photo_url, checkout_photo_url'

  // Query 1 — today's records (whether active or completed)
  const todayQuery = supabase
    .from('staff_checkins')
    .select(selectFields)
    .gte('checked_in_at', startOfDay)
    .lte('checked_in_at', endOfDay)
    .order('checked_in_at', { ascending: true })

  // Query 2 — stale active sessions (not yet checked out) from before today.
  // Captures overnight shifts and forgotten sessions so the user can see and
  // close them, instead of being silently blocked from new check-ins.
  const staleActiveQuery = supabase
    .from('staff_checkins')
    .select(selectFields)
    .is('checked_out_at', null)
    .gte('checked_in_at', sevenDaysAgo)
    .lt('checked_in_at', startOfDay)
    .order('checked_in_at', { ascending: true })

  const [todayRes, staleRes] = await Promise.all([todayQuery, staleActiveQuery])

  if (todayRes.error) {
    console.error('Get today checkins error:', todayRes.error)
  }
  if (staleRes.error) {
    console.error('Get stale active checkins error:', staleRes.error)
  }

  const merged = [...(todayRes.data || []), ...(staleRes.data || [])]
  // Sort by checked_in_at ascending (stale first since they're older)
  merged.sort((a, b) => (a.checked_in_at || '').localeCompare(b.checked_in_at || ''))
  return merged
}

// ─── Shared helper: hydrate [ref:closure:UUID] / [ref:jce:UUID] markers ──────
//
// For records whose event FK is null but the original source was preserved as
// a tag in `note`, look up the corresponding closure/job_cost_events row and
// inject it back as a virtual `events: { id, name }` field. Also strips the
// `[ref:...]` marker from the displayed note so the UI doesn't show it.

const REF_TAG_RE = /\[ref:(closure|jce):([0-9a-fA-F-]{36})\]/

async function hydrateCheckinRefs<
  T extends { id: string; event_id: string | null; note: string | null; events?: { id: string; name: string } | null }
>(
  records: T[],
  supabase: ReturnType<typeof createServiceClient>,
): Promise<T[]> {
  if (records.length === 0) return records

  const refMap = new Map<string, { kind: 'closure' | 'jce'; refId: string }>()
  records.forEach(r => {
    if (r.event_id) return
    const m = r.note ? r.note.match(REF_TAG_RE) : null
    if (m) refMap.set(r.id, { kind: m[1] as 'closure' | 'jce', refId: m[2] })
  })
  if (refMap.size === 0) return records

  const closureIds = Array.from(new Set(
    Array.from(refMap.values()).filter(v => v.kind === 'closure').map(v => v.refId)
  ))
  const jceIds = Array.from(new Set(
    Array.from(refMap.values()).filter(v => v.kind === 'jce').map(v => v.refId)
  ))

  const [{ data: closureRows }, { data: jceRows }] = await Promise.all([
    closureIds.length > 0
      ? supabase.from('event_closures').select('id, event_name').in('id', closureIds)
      : Promise.resolve({ data: [] as { id: string; event_name: string }[] }),
    jceIds.length > 0
      ? supabase.from('job_cost_events').select('id, event_name').in('id', jceIds)
      : Promise.resolve({ data: [] as { id: string; event_name: string }[] }),
  ])

  const closureMap = new Map(closureRows?.map(c => [c.id, c.event_name]) || [])
  const jceMap = new Map(jceRows?.map(j => [j.id, j.event_name]) || [])

  return records.map(r => {
    const ref = refMap.get(r.id)
    if (!ref) return r
    let virtualEvent: { id: string; name: string } | null = null
    if (ref.kind === 'closure') {
      const name = closureMap.get(ref.refId)
      if (name) virtualEvent = { id: `closure:${ref.refId}`, name }
    } else {
      const name = jceMap.get(ref.refId)
      if (name) virtualEvent = { id: `jce:${ref.refId}`, name }
    }
    const cleanedNote = r.note
      ? (r.note.replace(REF_TAG_RE, '').replace(/\s+$/, '').trim() || null)
      : null
    return { ...r, events: r.events || virtualEvent, note: cleanedNote }
  })
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await hydrateCheckinRefs((data || []) as any[], supabase) as any
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
  const { userId, role } = await getSession()
  if (!userId) return { records: [], staff: [] }
  const isAdmin = role === 'admin'

  const supabase = createServiceClient()

  const startISO = new Date(`${startDate}T00:00:00+07:00`).toISOString()
  const endISO = new Date(`${endDate}T23:59:59+07:00`).toISOString()

  // Non-admins see only their own records; admins see everyone's.
  let recordsQuery = supabase
    .from('staff_checkins')
    .select('id, user_id, check_type, checked_in_at, checked_out_at, note, latitude, longitude, photo_url, checkout_photo_url, event_id, events:event_id(id, name, crm_lead_id), profiles:user_id(id, full_name, nickname)')
    .gte('checked_in_at', startISO)
    .lte('checked_in_at', endISO)
    .order('checked_in_at', { ascending: true })
  if (!isAdmin) recordsQuery = recordsQuery.eq('user_id', userId)

  // Non-admins only need their own profile for the staff list (used for the
  // per-staff breakdown row).
  let staffQuery = supabase
    .from('profiles')
    .select('id, full_name, nickname, standard_hours, late_hour, late_minute, ot_threshold')
    .order('full_name')
  if (!isAdmin) staffQuery = staffQuery.eq('id', userId)

  const [recordsResult, staffResult] = await Promise.all([recordsQuery, staffQuery])

  const records = recordsResult.data || []
  if (records.length === 0) return { records: [], staff: staffResult.data || [] }

  // Parse [ref:closure:UUID] / [ref:jce:UUID] tags out of `note` for records
  // whose event FK was nulled at write time (admin picked a closure / a
  // job_cost_events row that had no source_event_id). These tags let us
  // hydrate the event name back as a "virtual event" for display.
  const REF_RE = /\[ref:(closure|jce):([0-9a-fA-F-]{36})\]/
  const noteRefs = new Map<string, { kind: 'closure' | 'jce'; refId: string }>()
  records.forEach(r => {
    if (r.event_id) return // real event FK takes precedence
    const m = r.note ? r.note.match(REF_RE) : null
    if (m) noteRefs.set(r.id, { kind: m[1] as 'closure' | 'jce', refId: m[2] })
  })

  const closureIds = Array.from(new Set(
    Array.from(noteRefs.values()).filter(v => v.kind === 'closure').map(v => v.refId)
  ))
  const jceIds = Array.from(new Set(
    Array.from(noteRefs.values()).filter(v => v.kind === 'jce').map(v => v.refId)
  ))

  const eventIds = Array.from(new Set(records.map(r => r.event_id).filter(Boolean))) as string[]

  const [
    { data: closureRows },
    { data: jceRows },
  ] = await Promise.all([
    closureIds.length > 0
      ? supabase.from('event_closures').select('id, event_name').in('id', closureIds)
      : Promise.resolve({ data: [] as { id: string; event_name: string }[] }),
    jceIds.length > 0
      ? supabase.from('job_cost_events').select('id, event_name, source_event_id').in('id', jceIds)
      : Promise.resolve({ data: [] as { id: string; event_name: string; source_event_id: string | null }[] }),
  ])

  const closureMap = new Map<string, string>()
  closureRows?.forEach(c => closureMap.set(c.id, c.event_name))
  const jceMap = new Map<string, { name: string; sourceEventId: string | null }>()
  jceRows?.forEach(j => jceMap.set(j.id, { name: j.event_name, sourceEventId: j.source_event_id }))

  // jce rows may carry a source_event_id we can use for role lookup (event_staff /
  // crm_lead_staff). Add those to eventIds so the staff-role join below finds them.
  jceRows?.forEach(j => { if (j.source_event_id) eventIds.push(j.source_event_id) })
  const dedupedEventIds = Array.from(new Set(eventIds))

  const leadIds = Array.from(new Set(records.map(r => (r.events as any)?.crm_lead_id).filter(Boolean))) as string[]

  const [{ data: eStaff }, { data: cStaff }, { data: settingsData }] = await Promise.all([
    dedupedEventIds.length > 0 ? supabase.from('event_staff').select('event_id, user_id, role').in('event_id', dedupedEventIds) : { data: [] },
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
    // Effective event_id for role lookup — falls back to the jce ref's
    // source_event_id when the FK was nulled at write time.
    let effectiveEventId: string | null = r.event_id
    let virtualEvent: { id: string; name: string } | null = null
    let displayNote: string | null = r.note

    if (!r.event_id) {
      const ref = noteRefs.get(r.id)
      if (ref) {
        if (ref.kind === 'closure') {
          const name = closureMap.get(ref.refId)
          if (name) virtualEvent = { id: `closure:${ref.refId}`, name }
        } else {
          const jce = jceMap.get(ref.refId)
          if (jce) {
            virtualEvent = { id: `jce:${ref.refId}`, name: jce.name }
            if (jce.sourceEventId) effectiveEventId = jce.sourceEventId
          }
        }
        // Strip the marker so the UI/Export shows a clean note.
        if (displayNote) {
          displayNote = displayNote.replace(REF_RE, '').replace(/\s+$/, '').trim() || null
        }
      }
    }

    if (effectiveEventId) {
      const eKey = `${effectiveEventId}_${r.user_id}`
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

    const events = r.events || virtualEvent
    return { ...r, events, note: displayNote, assigned_roles }
  })

  return {
    records: mappedRecords,
    staff: staffResult.data || [],
  }
}

// ─── User: Update event of own check-in ─────────────────
//
// Mirrors adminUpdateCheckinEvent but scoped to the caller's own records.
// Ownership is enforced by matching staff_checkins.user_id against the
// session's userId — both in the SELECT (to fetch the existing row) and
// in the UPDATE's WHERE clause (defense in depth).

export async function updateMyCheckinEvent(checkinId: string, rawEventRef: string | null) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  if (!checkinId) return { error: 'ไม่พบ record' }

  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('staff_checkins')
    .select('id, user_id, note, check_type')
    .eq('id', checkinId)
    .eq('user_id', userId)
    .single()

  if (!existing) return { error: 'ไม่พบ record หรือไม่ใช่ของคุณ' }
  if (existing.check_type !== 'onsite') {
    return { error: 'แก้ไขอีเวนต์ได้เฉพาะ Check-in ประเภท "ไปหน้างาน" เท่านั้น' }
  }

  const REF_GLOBAL = /\s*\[ref:(closure|jce):[0-9a-fA-F-]{36}\]/g
  let cleanedNote: string | null = existing.note
    ? existing.note.replace(REF_GLOBAL, '').trim()
    : null
  if (cleanedNote === '') cleanedNote = null

  let newEventId: string | null = null
  let refTag: string | null = null

  if (rawEventRef) {
    if (rawEventRef.startsWith('stock:')) {
      newEventId = rawEventRef.replace('stock:', '')
    } else if (rawEventRef.startsWith('closure:')) {
      refTag = `[ref:${rawEventRef}]`
    } else {
      const { data: jce } = await supabase
        .from('job_cost_events')
        .select('source_event_id')
        .eq('id', rawEventRef)
        .single()
      newEventId = jce?.source_event_id || null
      if (!newEventId) refTag = `[ref:jce:${rawEventRef}]`
    }
  }

  const finalNote = refTag
    ? (cleanedNote ? `${cleanedNote} ${refTag}` : refTag)
    : cleanedNote

  const { error } = await supabase
    .from('staff_checkins')
    .update({ event_id: newEventId, note: finalNote })
    .eq('id', checkinId)
    .eq('user_id', userId)

  if (error) {
    console.error('Update my checkin event error:', error)
    return { error: 'เกิดข้อผิดพลาดในการบันทึก' }
  }

  revalidatePath('/check-in')
  revalidatePath('/check-in/history')
  return { success: true }
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

// ─── Manual: Re-link an onsite check-in to an event (Admin Only) ──────
//
// Accepts the same prefixed-ID format that the admin check-in form uses
// (stock:UUID / closure:UUID / raw job_cost_events.UUID / empty to clear).
// Mirrors the resolution logic in adminCheckIn — when the source can't be
// FK'd to events.id, the original ref is preserved in `note` via the
// `[ref:closure:UUID]` or `[ref:jce:UUID]` marker so the report fetcher
// can hydrate it back as a virtual event.

export async function adminUpdateCheckinEvent(checkinId: string, rawEventRef: string | null) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'ไม่มีสิทธิ์' }

  if (!checkinId) return { error: 'ไม่พบ record' }

  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('staff_checkins')
    .select('id, note')
    .eq('id', checkinId)
    .single()

  if (!existing) return { error: 'ไม่พบ record' }

  // Strip any existing [ref:...] tag from the note before recomputing.
  const REF_GLOBAL = /\s*\[ref:(closure|jce):[0-9a-fA-F-]{36}\]/g
  let cleanedNote: string | null = existing.note
    ? existing.note.replace(REF_GLOBAL, '').trim()
    : null
  if (cleanedNote === '') cleanedNote = null

  let newEventId: string | null = null
  let refTag: string | null = null

  if (rawEventRef) {
    if (rawEventRef.startsWith('stock:')) {
      newEventId = rawEventRef.replace('stock:', '')
    } else if (rawEventRef.startsWith('closure:')) {
      refTag = `[ref:${rawEventRef}]`
    } else {
      // job_cost_events ID — resolve to source_event_id when possible
      const { data: jce } = await supabase
        .from('job_cost_events')
        .select('source_event_id')
        .eq('id', rawEventRef)
        .single()
      newEventId = jce?.source_event_id || null
      if (!newEventId) refTag = `[ref:jce:${rawEventRef}]`
    }
  }

  const finalNote = refTag
    ? (cleanedNote ? `${cleanedNote} ${refTag}` : refTag)
    : cleanedNote

  const { error } = await supabase
    .from('staff_checkins')
    .update({ event_id: newEventId, note: finalNote })
    .eq('id', checkinId)

  if (error) {
    console.error('Update checkin event error:', error)
    return { error: 'เกิดข้อผิดพลาดในการบันทึก' }
  }

  revalidatePath('/check-in/report')
  return { success: true }
}

// ─── Backfill: Recover event links for orphaned onsite check-ins (Admin Only)
//
// Two-phase strategy:
//
//   Phase 1 (exact, preferred): match via `expense_claims.from_checkin_id`.
//     When the user originally checked out on-site, autoCreateExpenseFromCheckin
//     wrote a row in expense_claims linking the checkin to a job_cost_events
//     row. That link survives even when the original `events` row is later
//     deleted. We resolve back to the real events.id via jce.source_event_id
//     when present (set event_id directly), or fall back to a [ref:jce:UUID]
//     marker so the report fetcher still surfaces the event name.
//
//   Phase 2 (heuristic, fallback): for check-ins still orphaned, match by
//     Bangkok-date against event_closures. If a unique closure exists for
//     that date, write [ref:closure:UUID] into note. Skip 0-match and
//     ambiguous (>1) cases — those need the manual edit UI.

export async function backfillCheckinEvents(): Promise<{
  fixed: number
  fixedByExpense: number
  fixedByDate: number
  skippedNoMatch: number
  skippedAmbiguous: number
  alreadyLinked: number
  error?: string
}> {
  const empty = { fixed: 0, fixedByExpense: 0, fixedByDate: 0, skippedNoMatch: 0, skippedAmbiguous: 0, alreadyLinked: 0 }

  const { role } = await getSession()
  if (role !== 'admin') return { ...empty, error: 'ไม่มีสิทธิ์' }

  const supabase = createServiceClient()

  const { data: candidates, error: fetchErr } = await supabase
    .from('staff_checkins')
    .select('id, user_id, checked_in_at, note')
    .eq('check_type', 'onsite')
    .is('event_id', null)

  if (fetchErr) {
    console.error('Backfill fetch error:', fetchErr)
    return { ...empty, error: 'ดึงข้อมูลไม่สำเร็จ' }
  }

  if (!candidates || candidates.length === 0) return empty

  const REF_RE = /\[ref:(closure|jce):[0-9a-fA-F-]{36}\]/

  const alreadyLinked = candidates.filter(c => c.note && REF_RE.test(c.note)).length
  let remaining = candidates.filter(c => !c.note || !REF_RE.test(c.note))

  if (remaining.length === 0) return { ...empty, alreadyLinked }

  let fixedByExpense = 0
  let fixedByDate = 0
  let skippedNoMatch = 0
  let skippedAmbiguous = 0

  // ─── Phase 1: expense_claims.from_checkin_id → job_cost_events ──────────
  const checkinIds = remaining.map(c => c.id)
  const { data: expenses } = await supabase
    .from('expense_claims')
    .select('from_checkin_id, job_event_id')
    .in('from_checkin_id', checkinIds)
    .not('job_event_id', 'is', null)

  const expenseByCheckin = new Map<string, string>() // checkinId → job_event_id
  expenses?.forEach(e => {
    if (e.from_checkin_id && e.job_event_id && !expenseByCheckin.has(e.from_checkin_id)) {
      expenseByCheckin.set(e.from_checkin_id, e.job_event_id)
    }
  })

  if (expenseByCheckin.size > 0) {
    const jobEventIds = Array.from(new Set(Array.from(expenseByCheckin.values())))
    const { data: jceRows } = await supabase
      .from('job_cost_events')
      .select('id, source_event_id')
      .in('id', jobEventIds)

    const jceSourceMap = new Map<string, string | null>()
    jceRows?.forEach(j => jceSourceMap.set(j.id, j.source_event_id))

    const stillRemaining: typeof remaining = []
    for (const c of remaining) {
      const jobEventId = expenseByCheckin.get(c.id)
      if (!jobEventId) { stillRemaining.push(c); continue }

      const sourceEventId = jceSourceMap.get(jobEventId)
      if (sourceEventId) {
        // Original events row still exists — restore the real FK.
        const { error: updErr } = await supabase
          .from('staff_checkins')
          .update({ event_id: sourceEventId })
          .eq('id', c.id)
        if (updErr) { console.error('Phase1 update error:', updErr); stillRemaining.push(c); continue }
      } else {
        // events row deleted but job_cost_events snapshot remains — write a jce ref.
        const refTag = `[ref:jce:${jobEventId}]`
        const newNote = c.note ? `${c.note} ${refTag}` : refTag
        const { error: updErr } = await supabase
          .from('staff_checkins')
          .update({ note: newNote })
          .eq('id', c.id)
        if (updErr) { console.error('Phase1 note error:', updErr); stillRemaining.push(c); continue }
      }
      fixedByExpense++
    }
    remaining = stillRemaining
  }

  // ─── Phase 2: closure-date heuristic for whatever's left ────────────────
  if (remaining.length > 0) {
    const BANGKOK_OFFSET = 7 * 60 * 60 * 1000
    const bangkokDate = (iso: string) =>
      new Date(new Date(iso).getTime() + BANGKOK_OFFSET).toISOString().split('T')[0]

    const dates = Array.from(new Set(remaining.map(c => bangkokDate(c.checked_in_at))))
    const minDate = dates.reduce((a, b) => (a < b ? a : b))
    const maxDate = dates.reduce((a, b) => (a > b ? a : b))
    const rangeStartISO = new Date(`${minDate}T00:00:00+07:00`).toISOString()
    const rangeEndISO = new Date(`${maxDate}T23:59:59+07:00`).toISOString()

    const { data: closures } = await supabase
      .from('event_closures')
      .select('id, event_date')
      .gte('event_date', rangeStartISO)
      .lte('event_date', rangeEndISO)

    const closureByDate = new Map<string, string[]>()
    closures?.forEach(c => {
      if (!c.event_date) return
      const d = bangkokDate(c.event_date)
      if (!closureByDate.has(d)) closureByDate.set(d, [])
      closureByDate.get(d)!.push(c.id)
    })

    for (const c of remaining) {
      const d = bangkokDate(c.checked_in_at)
      const matches = closureByDate.get(d) || []

      if (matches.length === 1) {
        const refTag = `[ref:closure:${matches[0]}]`
        const newNote = c.note ? `${c.note} ${refTag}` : refTag
        const { error: updErr } = await supabase
          .from('staff_checkins')
          .update({ note: newNote })
          .eq('id', c.id)
        if (updErr) { console.error('Phase2 update error:', updErr); skippedNoMatch++ }
        else fixedByDate++
      } else if (matches.length === 0) {
        skippedNoMatch++
      } else {
        skippedAmbiguous++
      }
    }
  }

  revalidatePath('/check-in/report')
  return {
    fixed: fixedByExpense + fixedByDate,
    fixedByExpense,
    fixedByDate,
    skippedNoMatch,
    skippedAmbiguous,
    alreadyLinked,
  }
}
