'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { cookies } from 'next/headers'

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
