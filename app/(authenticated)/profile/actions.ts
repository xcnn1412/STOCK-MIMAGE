'use server'

import { createServiceClient, removeStorageByUrls } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { requireAuth } from '@/lib/auth'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'

export async function updateMyProfile(data: {
  full_name?: string
  nickname?: string
  department?: string | null
  national_id?: string
  address?: string
  bank_name?: string
  bank_account_number?: string
  account_holder_name?: string
}) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  if (!userId) {
    return { error: 'Unauthorized: No active session' }
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('profiles')
    .update(data as Record<string, unknown>)
    .eq('id', userId)

  if (error) {
    console.error(error)
    return { error: 'Failed to update profile' }
  }

  await logActivity('UPDATE_MY_PROFILE', data, userId)

  revalidatePath('/profile')
  revalidatePath('/users')
  return { success: true }
}

export async function getMyProfile() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  if (!userId) return null

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, nickname, national_id, address, bank_name, bank_account_number, account_holder_name, department, phone, role, signature_url')
    .eq('id', userId)
    .single()

  return data
}

// ─── ลายเซ็นสำหรับเอกสาร ────────────────────────────────────

// bucket สร้างโดย migration 20260827_create_documents_module.sql (ไม่มี bucket 'avatars' ในระบบ)
const SIGNATURE_BUCKET = 'doc-assets'
const SIGNATURE_MAX_BYTES = 1 * 1024 * 1024

/**
 * ผู้ใช้ที่ล็อกอินอยู่ — รองรับทั้ง session_token ใหม่และคุกกี้ legacy
 * (ทั้งสอง action ด้านล่างแก้ได้เฉพาะโปรไฟล์ตัวเอง เพราะ userId มาจาก session เท่านั้น)
 */
async function getOwnUserId(): Promise<string | null> {
  const session = await requireAuth()
  if (session) return session.userId

  const cookieStore = await cookies()
  if (cookieStore.get('session_token')?.value) return null
  const legacyId = cookieStore.get('session_user_id')?.value
  if (!legacyId) return null

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, is_approved')
    .eq('id', legacyId)
    .single()

  return data?.is_approved ? data.id : null
}

export async function updateSignature(formData: FormData): Promise<{ error?: string; url?: string }> {
  const userId = await getOwnUserId()
  if (!userId) return { error: 'Unauthorized: No active session' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'ไม่พบไฟล์' }
  // นามสกุลต้องตรงกับชนิดไฟล์จริงเสมอ — ไม่งั้น @react-pdf/renderer อ่านรูปไม่ออก
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : null
  if (!ext) return { error: 'รองรับเฉพาะไฟล์ PNG หรือ JPG' }
  if (file.size > SIGNATURE_MAX_BYTES) return { error: 'ไฟล์ต้องไม่เกิน 1MB' }

  const supabase = createServiceClient()
  const path = `signatures/${userId}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true })
  if (upErr) return { error: upErr.message }

  const { data: pub } = supabase.storage.from(SIGNATURE_BUCKET).getPublicUrl(path)
  // cache-buster ต่อท้าย เพราะ upsert ทับ path เดิม CDN จะคืนรูปเก่า
  const url = `${pub.publicUrl}?v=${Date.now()}`

  const { error } = await supabase
    .from('profiles')
    .update({ signature_url: url })
    .eq('id', userId)
  if (error) {
    console.error('updateSignature:', error)
    return { error: 'บันทึกลายเซ็นไม่สำเร็จ' }
  }

  await logActivity('UPDATE_SIGNATURE', { action: 'upload', path }, userId)

  revalidatePath('/profile')
  return { url }
}

export async function removeSignature(): Promise<{ error?: string; success?: boolean }> {
  const userId = await getOwnUserId()
  if (!userId) return { error: 'Unauthorized: No active session' }

  const supabase = createServiceClient()
  const { data: current } = await supabase
    .from('profiles')
    .select('signature_url')
    .eq('id', userId)
    .single()

  const { error } = await supabase
    .from('profiles')
    .update({ signature_url: null })
    .eq('id', userId)
  if (error) {
    console.error('removeSignature:', error)
    return { error: 'ลบลายเซ็นไม่สำเร็จ' }
  }

  // ตัด ?v=... ออกก่อน เพราะ removeStorageByUrls แปลง URL เป็น path ตรงๆ
  const storedUrl = current?.signature_url?.split('?')[0]
  await removeStorageByUrls(supabase, SIGNATURE_BUCKET, [storedUrl])

  await logActivity('UPDATE_SIGNATURE', { action: 'remove' }, userId)

  revalidatePath('/profile')
  return { success: true }
}

// ─── เปลี่ยน PIN ──────────────────────────────────────────

export async function changePin(formData: {
  currentPin: string
  newPin: string
  confirmPin: string
}) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  if (!userId) {
    return { error: 'Unauthorized: No active session' }
  }

  const { currentPin, newPin, confirmPin } = formData

  // Validate inputs
  if (!currentPin || !newPin || !confirmPin) {
    return { error: 'กรุณากรอกข้อมูลให้ครบ' }
  }

  if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
    return { error: 'PIN ใหม่ต้องเป็นตัวเลข 6 หลัก' }
  }

  if (newPin !== confirmPin) {
    return { error: 'PIN ใหม่ไม่ตรงกัน กรุณากรอกใหม่' }
  }

  if (currentPin === newPin) {
    return { error: 'PIN ใหม่ต้องไม่เหมือน PIN เดิม' }
  }

  const supabase = createServiceClient()

  // Fetch current PIN hash
  const { data: user, error: fetchError } = await supabase
    .from('profiles')
    .select('pin')
    .eq('id', userId)
    .single()

  if (fetchError || !user) {
    return { error: 'ไม่พบข้อมูลผู้ใช้' }
  }

  // Verify current PIN
  const isCurrentPinValid = await bcrypt.compare(currentPin, user.pin || '')
  if (!isCurrentPinValid) {
    return { error: 'PIN ปัจจุบันไม่ถูกต้อง' }
  }

  // Hash new PIN and update
  const hashedNewPin = await bcrypt.hash(newPin, 12)

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ pin: hashedNewPin })
    .eq('id', userId)

  if (updateError) {
    console.error('Change PIN error:', updateError)
    return { error: 'เกิดข้อผิดพลาดในการเปลี่ยน PIN' }
  }

  await logActivity('CHANGE_PIN', { method: 'self_service' }, userId)

  return { success: true }
}
