'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { cookies } from 'next/headers'



export async function toggleUserApproval(userId: string, currentStatus: boolean) {
  const cookieStore = await cookies()
  const sessionUserId = cookieStore.get('session_user_id')?.value
  if (!sessionUserId) {
      return { error: 'Unauthorized: No active session' }
  }

  const supabase = createServiceClient()
  
  const { error } = await supabase
    .from('profiles')
    .update({ is_approved: !currentStatus })
    .eq('id', userId)

  if (error) {
    console.error(error)
    return { error: 'Failed to update status' }
  }

  await logActivity(
    !currentStatus ? 'APPROVE_USER' : 'REVOKE_USER', 
    { previousStatus: currentStatus }, 
    userId
  )

  revalidatePath('/users')
}

export async function updateUserRole(userId: string, role: string) {
    const cookieStore = await cookies()
    const sessionUserId = cookieStore.get('session_user_id')?.value
    if (!sessionUserId) {
        return { error: 'Unauthorized: No active session' }
    }

    const supabase = createServiceClient()
    
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)
  
    if (error) {
      console.error(error)
      return { error: 'Failed to update role' }
    }

    await logActivity('UPDATE_ROLE', { role }, userId)
  
    revalidatePath('/users')
}

export async function deleteUser(userId: string) {
    const cookieStore = await cookies()
    const sessionUserId = cookieStore.get('session_user_id')?.value
    if (!sessionUserId) {
        return { error: 'Unauthorized: No active session' }
    }

    const supabase = createServiceClient()
    
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)
  
    if (error) {
      console.error(error)
      return { error: 'Failed to delete user' }
    }

    await logActivity('DELETE_USER', {}, userId)
  
    revalidatePath('/users')
}

export async function updateUserModules(userId: string, modules: string[]) {
    const cookieStore = await cookies()
    const sessionUserId = cookieStore.get('session_user_id')?.value
    if (!sessionUserId) {
        return { error: 'Unauthorized: No active session' }
    }

    const supabase = createServiceClient()
    
    const { error } = await supabase
      .from('profiles')
      .update({ allowed_modules: modules } as Record<string, unknown>)
      .eq('id', userId)
  
    if (error) {
      console.error(error)
      return { error: 'Failed to update modules' }
    }

    await logActivity('UPDATE_MODULES', { modules }, userId)
  
    revalidatePath('/users')
}
