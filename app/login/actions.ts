'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/logger'

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

function dataURItoBlob(dataURI: string) {
    const split = dataURI.split(',');
    const byteString = atob(split[1]);
    const mimeString = split[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
}

export async function loginWithPhoneAndSelfie(prevState: any, formData: FormData) {
  const phone = formData.get('phone') as string
  const pin = formData.get('pin') as string
  const latitude = formData.get('latitude') as string
  const longitude = formData.get('longitude') as string
  const selfieDataUrl = formData.get('selfie_image') as string

  if (!phone || !pin) {
    return { error: 'Phone number and PIN are required' }
  }

  if (!selfieDataUrl) {
      return { error: 'Selfie is required for verification' }
  }

  const supabase = getSupabase()

  try {
    // 1. Verify Credentials
    const { data: user, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('phone', phone)
      .single()

    if (error || !user) {
       return { error: 'Phone number not found' }
    }

    if (user.pin !== pin) {
        return { error: 'Invalid PIN' }
    }

    if (!user.is_approved) {
        return { error: 'Your account is pending approval by an admin.' }
    }

    // 2. Upload Selfie
    let selfiePath = ''
    try {
        const selfieBlob = dataURItoBlob(selfieDataUrl)
        const fileName = `${user.id}_${Date.now()}.jpg`
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('login_selfies')
            .upload(fileName, selfieBlob, {
                contentType: 'image/jpeg'
            })
        
        if (uploadError) {
            console.error('Selfie upload failed:', uploadError)
            // Proceed even if upload fails? Or block?
            // "System busy" implies block. Let's block for security/requirements.
            // But if bucket doesn't exist it will fail. Let's assume bucket exists.
            // For resilience in this demo, maybe just log it. 
            // The requirement says "clear data" later, so it implies it MUST be stored.
            // I'll return error to force them to fix bucket if missing.
            return { error: 'Failed to verify identity (Storage Error). check bucket.' }
        }
        selfiePath = uploadData.path
    } catch (e) {
        console.error("Selfie processing error", e)
        return { error: 'Failed to process selfie image' }
    }

    // 3. Log Location & Login
    const sessionId = crypto.randomUUID() // Generate unique session ID

    await supabase.from('login_logs').insert({
        user_id: user.id,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        selfie_url: selfiePath
    })

    // UPDATE Single Session ID
    await supabase.from('profiles')
        .update({ active_session_id: sessionId })
        .eq('id', user.id)

    // NEW: Comprehensive Activity Log
    await logActivity('LOGIN', { 
        latitude: latitude || null, 
        longitude: longitude || null,
        method: 'phone_pin_selfie'
    }, undefined, user.id)

    // 4. Set Session
    const cookieStore = await cookies()
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    
    await cookieStore.set('session_user_id', user.id, { httpOnly: true, expires, path: '/' })
    await cookieStore.set('session_role', user.role, { httpOnly: true, expires, path: '/' })
    await cookieStore.set('session_id', sessionId, { httpOnly: true, expires, path: '/' })
    // Store selfie path to delete on logout
    await cookieStore.set('session_selfie_path', selfiePath, { httpOnly: true, expires, path: '/' })

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

    const { data: newUser, error } = await supabase.from('profiles').insert({
        full_name: name,
        phone,
        pin,
        role: 'staff', // Default role
        is_approved: false
    }).select().single()

    if (error) {
        console.error('Registration error', error)
        return { error: 'Failed to register. Phone might be duplicate.' }
    }

    if (newUser) {
        await logActivity('REGISTER', { name, phone }, undefined, newUser.id)
    }

    return { error: '', success: 'Registration successful! Please wait for admin approval before logging in.' }
}

export async function logout() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value

  if (userId) {
      await logActivity('LOGOUT', {}, undefined, userId)
  }

  const selfiePath = cookieStore.get('session_selfie_path')?.value

  // Delete selfie if exists
  if (selfiePath) {
      const supabase = getSupabase()
      await supabase.storage.from('login_selfies').remove([selfiePath])
      
      if (userId) {
        // Clear active_session_id on server too? 
        // Optional: It forces a logout everywhere, but we are just logging out here.
        // It helps keep state clean.
        await supabase.from('profiles').update({ active_session_id: null }).eq('id', userId)
      }
  }

  cookieStore.delete('session_user_id')
  cookieStore.delete('session_role')
  cookieStore.delete('session_selfie_path')
  cookieStore.delete('session_id')
  
  redirect('/login')
}
