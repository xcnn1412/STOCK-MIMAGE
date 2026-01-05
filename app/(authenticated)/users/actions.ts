'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'

function createServerSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
}

export async function toggleUserApproval(userId: string, currentStatus: boolean) {
  const supabase = createServerSupabase()
  
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
    const supabase = createServerSupabase()
    
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
    const supabase = createServerSupabase()
    
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
