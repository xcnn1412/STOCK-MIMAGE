'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { cookies } from 'next/headers'
import type { ActionState, Database } from '@/types'


export async function createKit(prevState: ActionState, formData: FormData) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  if (!userId) {
      return { error: 'Unauthorized: No active session' }
  }

  const name = formData.get('name') as string
  const description = formData.get('description') as string

  const supabase = createServiceClient()
  const { data: newKit, error } = await supabase.from('kits').insert({
    name,
    description
  }).select().single()

  if (error) {
     return { error: error.message }
  }

  await logActivity('CREATE_KIT', { name, description }, undefined, undefined)

  revalidatePath('/kits')
  redirect('/kits')
}

export async function deleteKit(id: string) {
    const cookieStore = await cookies()
    const userId = cookieStore.get('session_user_id')?.value
    if (!userId) {
        throw new Error('Unauthorized: No active session')
    }

    const supabase = createServiceClient()
    
    // Fetch details before delete
    const { data: kit } = await supabase.from('kits').select('name').eq('id', id).single()

    const { error } = await supabase.from('kits').delete().eq('id', id)
    
    if (error) {
        throw new Error(error.message)
    }
    
    await logActivity('DELETE_KIT', { 
        name: kit?.name || 'Unknown Kit',
        id 
    }, undefined)
    
    revalidatePath('/kits')
}
