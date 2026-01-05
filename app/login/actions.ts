'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

export async function loginWithPhone(prevState: any, formData: FormData) {
  const phone = formData.get('phone') as string

  if (!phone) {
    return { error: 'Phone number is required' }
  }

  // Create a fresh client for this server action to avoid caching issues
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    }
  )

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('phone', phone)
      .single()

    if (error || !data) {
       console.error('Login error:', error)
       return { error: 'Phone number not recognized' }
    }

    const cookieStore = await cookies()
    // Expire in 7 days
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    
    // Using string values for cookies
    await cookieStore.set('session_user_id', data.id, { httpOnly: true, expires, path: '/' })
    await cookieStore.set('session_role', data.role, { httpOnly: true, expires, path: '/' })

  } catch (err: any) {
    console.error('Unexpected error:', err)
     return { error: 'System busy, please try again.' }
  }

  // Redirect must be outside try/catch to work properly in Next.js Server Actions
  redirect('/dashboard')
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete('session_user_id')
  cookieStore.delete('session_role')
  redirect('/login')
}
