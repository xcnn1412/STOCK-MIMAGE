'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'

export async function updateMyProfile(data: {
  full_name?: string
  nickname?: string
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
    .select('id, full_name, nickname, national_id, address, bank_name, bank_account_number, account_holder_name, phone, role')
    .eq('id', userId)
    .single()

  return data
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
