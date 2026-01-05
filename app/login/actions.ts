'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
    return createClient(
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
}

export async function loginWithPhone(prevState: any, formData: FormData) {
  const phone = formData.get('phone') as string
  const pin = formData.get('pin') as string

  if (!phone || !pin) {
    return { error: 'Phone number and PIN are required' }
  }

  const supabase = getSupabase()

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('phone', phone)
      .single()

    if (error || !data) {
       console.error('Login error:', error)
       return { error: 'Phone number not found' }
    }

    // Check PIN
    // Note: In a production app, PINs should be hashed. 
    // Here we compare directly as requested for simplicity or assume matching logic.
    if (data.pin !== pin) {
        return { error: 'Invalid PIN' }
    }

    const cookieStore = await cookies()
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    
    await cookieStore.set('session_user_id', data.id, { httpOnly: true, expires, path: '/' })
    await cookieStore.set('session_role', data.role, { httpOnly: true, expires, path: '/' })

  } catch (err: any) {
    console.error('Unexpected error:', err)
     return { error: 'System busy, please try again.' }
  }

  redirect('/dashboard')
}

export async function registerUser(prevState: any, formData: FormData) {
    const name = formData.get('name') as string
    const phone = formData.get('phone') as string
    const pin = formData.get('pin') as string

    if (!name || !phone || !pin) {
        return { error: 'All fields are required' }
    }

    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
        return { error: 'PIN must be exactly 6 digits' }
    }

    const supabase = getSupabase()

    // Check if exists
    const { data: existing } = await supabase.from('profiles').select('id').eq('phone', phone).single()
    if (existing) {
        return { error: 'Phone number already registered' }
    }

    const { error } = await supabase.from('profiles').insert({
        full_name: name,
        phone,
        pin,
        role: 'staff' // Default role
    })

    if (error) {
        console.error('Registration error', error)
        return { error: 'Failed to register. Phone might be duplicate.' }
    }

    // Auto login after register? Or just redirect to login tab.
    // Let's redirect to dashboard directly for better UX
    return loginWithPhone(prevState, formData)
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete('session_user_id')
  cookieStore.delete('session_role')
  redirect('/login')
}
