'use server'

import { createServiceClient, removeStorageByUrls } from '@/lib/supabase-server'
import { reverseGeocodeThai } from '@/lib/reverse-geocode'
import { logActivity } from '@/lib/logger'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import type { DutyInput } from '../salary/compute'

async function getSession() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value || 'staff'
  return { userId, role }
}

// ─── หน้าที่หน้างาน (salary_duties) ───────────────────────
//
// รหัสหน้าที่ถูกเก็บเป็น text[] ใน staff_checkins.duties แล้วโมดูลเงินเดือนเอาไปคูณ
// อัตราตอนคำนวณสลิป — ดังนั้นทุกจุดที่เขียน duties ต้องผ่าน validateDutyCodes ก่อน
// ไม่งั้นจะได้รหัสมั่วที่คำนวณเงินไม่ออก

/** อ่าน duties จาก FormData (ส่งซ้ำหลาย entry ชื่อเดียวกัน) — trim + ตัดค่าว่าง + ตัดซ้ำ */
function readDutyCodes(formData: FormData): string[] {
  return Array.from(new Set(
    formData.getAll('duties').map(v => String(v).trim()).filter(Boolean)
  ))
}

/** คืนข้อความ error ถ้ามีรหัสที่ไม่มีใน salary_duties, คืน null ถ้าผ่านหมด */
async function validateDutyCodes(
  supabase: ReturnType<typeof createServiceClient>,
  codes: string[]
): Promise<string | null> {
  if (codes.length === 0) return null

  // รับเฉพาะหน้าที่ที่เปิดใช้อยู่ — หน้าที่ที่ admin ปิดแล้วต้องเลือกไม่ได้แม้ส่ง FormData ตรงๆ
  // (compute ใช้อัตราของหน้าที่ที่ปิดแล้วได้ แต่เฉพาะกับเช็คอินเก่าที่บันทึกไว้ก่อนปิด)
  const { data, error } = await supabase
    .from('salary_duties')
    .select('code')
    .in('code', codes)
    .eq('is_active', true)

  if (error) {
    console.error('Duty codes lookup error:', error)
    return 'ตรวจสอบหน้าที่หน้างานไม่สำเร็จ'
  }

  const known = new Set((data || []).map((d: { code: string }) => d.code))
  const unknown = codes.filter(c => !known.has(c))
  if (unknown.length > 0) return `ไม่พบหน้าที่หน้างานหรือหน้าที่ถูกปิดใช้งาน: ${unknown.join(', ')}`
  return null
}

/** rate card ที่เปิดใช้อยู่ — ใช้ render checkbox ในฟอร์มเช็คอิน */
export async function getActiveDuties(): Promise<DutyInput[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('salary_duties')
    .select('code, name_th, rate, pay_mode, is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('Get active duties error:', error)
    return []
  }
  return (data || []) as unknown as DutyInput[]
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
  // หน้าที่หน้างานใช้เฉพาะ onsite — ประเภทอื่นเก็บ [] เสมอ
  const duties = checkType === 'onsite' ? readDutyCodes(formData) : []

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

  if (checkType === 'onsite' && duties.length === 0) {
    // fail-open: ถ้าระบบยังไม่มี rate card เลย (migration ยังไม่รัน / admin ปิดทุกหน้าที่)
    // อย่าบล็อกการเช็คอินของทั้งบริษัท — สลิปจะขึ้น warning "ไม่มีหน้าที่" ให้ admin เติมทีหลัง
    const active = await getActiveDuties()
    if (active.length > 0) return { error: 'กรุณาเลือกหน้าที่หน้างานอย่างน้อย 1 อย่าง' }
  }

  const dutyError = await validateDutyCodes(supabase, duties)
  if (dutyError) return { error: dutyError }

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
      duties,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Check-in error:', error)
    return { error: 'เกิดข้อผิดพลาดในการ Check-in' }
  }

  // ทุกอย่างหลัง insert เป็น best-effort — เช็คอินสำเร็จไปแล้ว ห้ามคืน error ทับ
  if (inserted?.id) {
    const postUpdates: Record<string, unknown> = {}

    // Upload photo if provided
    if (photoBase64) {
      const photoUrl = await uploadCheckinPhoto(supabase, userId, inserted.id, photoBase64)
      if (photoUrl) postUpdates.photo_url = photoUrl
    }

    // เติมจังหวัด/เขตจากพิกัด (เฉพาะ onsite) — ล้มเหลว/timeout = ปล่อยว่าง ผู้ใช้แก้เองได้
    if (checkType === 'onsite' && latitude !== null && longitude !== null) {
      const geo = await reverseGeocodeThai(latitude, longitude)
      if (geo.province || geo.district) {
        postUpdates.province = geo.province
        postUpdates.district = geo.district
      }
    }

    if (Object.keys(postUpdates).length > 0) {
      await supabase.from('staff_checkins').update(postUpdates).eq('id', inserted.id)
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
  // ฟิลด์ของโมดูลเงินเดือน — ใช้เฉพาะ onsite
  const isOnsite = checkType === 'onsite'
  const duties = isOnsite ? readDutyCodes(formData) : []
  const province = isOnsite ? (formData.get('province') as string || '').trim() || null : null
  const district = isOnsite ? (formData.get('district') as string || '').trim() || null : null
  const outOfProvince = isOnsite && formData.get('out_of_province') === 'true'

  if (!targetUserId) return { error: 'กรุณาเลือกพนักงาน' }
  if (!checkinDate) return { error: 'กรุณาเลือกวันที่' }
  if (!checkinTime) return { error: 'กรุณาเลือกเวลา' }
  if (isOnsite && duties.length === 0) {
    return { error: 'กรุณาเลือกหน้าที่หน้างานอย่างน้อย 1 อย่าง' }
  }

  const supabase = createServiceClient()

  const dutyError = await validateDutyCodes(supabase, duties)
  if (dutyError) return { error: dutyError }

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

  const { error } = await supabase
    .from('staff_checkins')
    .insert({
      user_id: targetUserId,
      check_type: checkType,
      event_id: resolvedEventId,
      checked_in_at: checkedInAt,
      checked_out_at: checkedOutAt,
      note: finalNote,
      duties,
      province,
      district,
      out_of_province: outOfProvince,
    })

  if (error) {
    console.error('Admin check-in error:', error)
    return { error: 'เกิดข้อผิดพลาดในการ Check-in' }
  }

  revalidatePath('/check-in')
  return { success: true }
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

  const { data: row } = await supabase
    .from('staff_checkins')
    .select('photo_url, checkout_photo_url')
    .eq('id', checkinId)
    .single()

  const { error } = await supabase
    .from('staff_checkins')
    .delete()
    .eq('id', checkinId)

  if (error) {
    console.error('Admin delete error:', error)
    return { error: 'เกิดข้อผิดพลาดในการลบ' }
  }

  // ลบรูปเช็คอิน/เช็คเอาต์ออกจาก Storage ไม่ให้กลายเป็น orphan
  if (row) await removeStorageByUrls(supabase, 'checkin-photos', [row.photo_url, row.checkout_photo_url])

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

  // ─── ฟิลด์โมดูลเงินเดือน (ทุกอันไม่บังคับ — ไม่ส่งมา = ไม่แก้) ───
  //
  // duties: ส่งซ้ำหลาย entry + ฟอร์มที่มีช่องหน้าที่ต้องส่ง duties_set=1 ด้วย —
  // "ไม่มี duties_set" = ไม่แตะของเดิม (ฟอร์มเก่าอย่างปุ่มล้าง check-out จึงยังใช้
  // action นี้ได้โดยไม่ลบหน้าที่ทิ้ง) / "มี duties_set แต่ว่าง" = ตั้งใจเอาออกทั้งหมด
  const dutiesSet = formData.get('duties_set') === '1'
  const duties = readDutyCodes(formData)
  if (dutiesSet || duties.length > 0) {
    if (duties.length > 0) {
      const dutyError = await validateDutyCodes(supabase, duties)
      if (dutyError) return { error: dutyError }
    }
    updates.duties = duties
  }
  // เปลี่ยนประเภทออกจาก onsite = ข้อมูลค่าสตาฟของเดิมใช้ไม่ได้แล้ว ล้างทิ้ง
  if (checkType && checkType !== 'onsite') {
    updates.duties = []
    updates.out_of_province = false
  }
  // onsite ต้องมีหน้าที่ ≥ 1 เสมอ (กติกาเดียวกับ checkIn/adminCheckIn) — ตรวจกับค่าหลังแก้
  {
    const { data: current } = await supabase
      .from('staff_checkins')
      .select('check_type, duties')
      .eq('id', checkinId)
      .single()
    if (!current) return { error: 'ไม่พบ record' }
    const finalType = (updates.check_type as string | undefined) ?? current.check_type
    const finalDuties = (updates.duties as string[] | undefined) ?? ((current.duties as string[] | null) ?? [])
    if (finalType === 'onsite' && finalDuties.length === 0) {
      return { error: 'เช็คอิน "ไปหน้างาน" ต้องมีหน้าที่หน้างานอย่างน้อย 1 อย่าง' }
    }
  }

  const provinceRaw = formData.get('province')
  if (provinceRaw !== null) updates.province = String(provinceRaw).trim() || null
  const districtRaw = formData.get('district')
  if (districtRaw !== null) updates.district = String(districtRaw).trim() || null

  // ต่างจังหวัดมีความหมายเฉพาะ onsite — ถ้ากำลังเปลี่ยนประเภทออกจาก onsite ให้คงค่าที่ล้างไว้ด้านบน
  const oopRaw = formData.get('out_of_province')
  if (!(checkType && checkType !== 'onsite')) {
    if (oopRaw === 'true') updates.out_of_province = true
    else if (oopRaw === 'false') updates.out_of_province = false
  }

  // ─── เวลาเข้า/ออก — รับเป็นคู่ YYYY-MM-DD + HH:mm (เวลาไทย) ───
  const checkinDate = (formData.get('checkin_date') as string | null) || null
  const checkinTime = (formData.get('checkin_time') as string | null) || null
  const checkoutDate = (formData.get('checkout_date') as string | null) || null
  const checkoutTime = (formData.get('checkout_time') as string | null) || null

  if (checkinDate || checkinTime || checkoutTime) {
    const { data: existing } = await supabase
      .from('staff_checkins')
      .select('id, checked_in_at, checked_out_at')
      .eq('id', checkinId)
      .single()

    if (!existing) return { error: 'ไม่พบ record' }

    let newCheckedInAt: string | null = null
    if (checkinDate || checkinTime) {
      if (!checkinDate || !checkinTime) return { error: 'กรุณาระบุทั้งวันที่และเวลาเข้า' }
      const d = new Date(`${checkinDate}T${checkinTime}:00+07:00`)
      if (isNaN(d.getTime())) return { error: 'วันที่/เวลาเข้าไม่ถูกต้อง' }
      newCheckedInAt = d.toISOString()
      updates.checked_in_at = newCheckedInAt
    }

    let newCheckedOutAt: string | null = null
    if (checkoutTime && !clearCheckout) {
      // ไม่ส่งวันที่ออกมา = วันเดียวกับเวลาเข้า (กะข้ามคืนให้ส่ง checkout_date มาด้วย)
      const bangkokOffset = 7 * 60 * 60 * 1000
      const baseDate = checkoutDate
        || checkinDate
        || new Date(new Date(existing.checked_in_at).getTime() + bangkokOffset).toISOString().split('T')[0]
      const d = new Date(`${baseDate}T${checkoutTime}:00+07:00`)
      if (isNaN(d.getTime())) return { error: 'วันที่/เวลาออกไม่ถูกต้อง' }
      newCheckedOutAt = d.toISOString()
      updates.checked_out_at = newCheckedOutAt
    }

    // เทียบกับค่าที่จะเป็นผลลัพธ์จริงหลังบันทึก (ของใหม่ถ้ามี ไม่งั้นของเดิม)
    const effectiveIn = newCheckedInAt || existing.checked_in_at
    const effectiveOut = clearCheckout ? null : (newCheckedOutAt || existing.checked_out_at)
    if (effectiveIn && effectiveOut && new Date(effectiveOut) <= new Date(effectiveIn)) {
      return { error: 'เวลาออกต้องหลังเวลาเข้า' }
    }
  }

  if (Object.keys(updates).length === 0) return { error: 'ไม่มีข้อมูลที่จะแก้ไข' }

  const { error } = await supabase
    .from('staff_checkins')
    .update(updates)
    .eq('id', checkinId)

  if (error) {
    console.error('Admin edit error:', error)
    return { error: 'เกิดข้อผิดพลาดในการแก้ไข' }
  }

  // ฟิลด์เหล่านี้กระทบยอดในสลิปเงินเดือน → ต้องมีร่องรอยใน activity log
  await logActivity('UPDATE_CHECKIN_DUTIES', { checkin_id: checkinId, ...updates })

  revalidatePath('/check-in')
  revalidatePath('/check-in/history')
  revalidatePath('/check-in/report')
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

  // Find assignments for this user to get their roles. event_staff (per event) is the
  // single source of truth — no crm_lead_staff union, which would attribute a sibling
  // sub-event's roles to every event under the same CRM lead.
  const { data: eStaff } = await supabase.from('event_staff').select('event_id, role').eq('user_id', userId)

  const eStaffRoles = new Map<string, string[]>()
  eStaff?.forEach(e => {
    if (!eStaffRoles.has(e.event_id)) eStaffRoles.set(e.event_id, [])
    eStaffRoles.get(e.event_id)!.push(e.role)
  })

  // Map events to attach roles nicely
  const mappedEvents = data.map(ev => {
    const rolesSet = new Set<string>()
    if (eStaffRoles.has(ev.id)) {
      eStaffRoles.get(ev.id)!.forEach(r => rolesSet.add(r))
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

  // Filter events: non-admin must be assigned to the event (via event_staff)
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
    .select('id, user_id, check_type, checked_in_at, checked_out_at, note, latitude, longitude, photo_url, checkout_photo_url, event_id, duties, province, district, out_of_province, events:event_id(id, name, crm_lead_id), profiles:user_id(id, full_name, nickname)')
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

  // jce rows may carry a source_event_id we can use for role lookup (event_staff).
  // Add those to eventIds so the staff-role join below finds them.
  jceRows?.forEach(j => { if (j.source_event_id) eventIds.push(j.source_event_id) })
  const dedupedEventIds = Array.from(new Set(eventIds))

  // Roles resolve from event_staff only (per event). No crm_lead_staff union — that
  // would attribute a sibling sub-event's roles to every event under the same lead.
  const [{ data: eStaff }, { data: settingsData }] = await Promise.all([
    dedupedEventIds.length > 0 ? supabase.from('event_staff').select('event_id, user_id, role').in('event_id', dedupedEventIds) : { data: [] },
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

// ─── User: Fix province/district of own check-in ────────
//
// จังหวัดมาจาก reverse geocode ซึ่งพลาดได้ (พิกัดคาบเส้น / GPS เพี้ยน) — พนักงาน
// แก้ของตัวเองได้ ส่วนหน้าที่หน้างานแก้ทีหลังไม่ได้ (เป็นของ admin ตาม spec).
// Ownership เช็คแบบเดียวกับ updateMyCheckinEvent — ทั้งตอน SELECT และใน WHERE ของ UPDATE

export async function updateMyCheckinLocation(
  checkinId: string,
  province: string | null,
  district: string | null,
) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  if (!checkinId) return { error: 'ไม่พบ record' }

  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('staff_checkins')
    .select('id, user_id, check_type')
    .eq('id', checkinId)
    .eq('user_id', userId)
    .single()

  if (!existing) return { error: 'ไม่พบ record หรือไม่ใช่ของคุณ' }
  if (existing.check_type !== 'onsite') {
    return { error: 'แก้ไขจังหวัดได้เฉพาะ Check-in ประเภท "ไปหน้างาน" เท่านั้น' }
  }

  const { error } = await supabase
    .from('staff_checkins')
    .update({
      province: province?.trim() || null,
      district: district?.trim() || null,
    })
    .eq('id', checkinId)
    .eq('user_id', userId)

  if (error) {
    console.error('Update my checkin location error:', error)
    return { error: 'เกิดข้อผิดพลาดในการบันทึก' }
  }

  await logActivity('UPDATE_CHECKIN_LOCATION', {
    checkin_id: checkinId,
    province: province?.trim() || null,
    district: district?.trim() || null,
  })

  revalidatePath('/check-in')
  revalidatePath('/check-in/history')
  revalidatePath('/check-in/report')
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
//     HISTORICAL DATA ONLY — check-out used to auto-create a "ค่าสตาฟ" expense
//     claim linking the checkin to a job_cost_events row. That behaviour was
//     removed when the salary module took over staff pay (ADR-0001), so no new
//     rows carry `from_checkin_id`; the old ones are still the best link we
//     have, and it survives even when the original `events` row is later
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
