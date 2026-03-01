'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import bcrypt from 'bcryptjs'
import { logActivity } from '@/lib/logger'
import { checkRateLimit } from '@/lib/rate-limit'
import { createSessionToken } from '@/lib/session'
import { checkIpBlocked } from '@/lib/ip-check'
import type { ActionState } from '@/types'

const MAX_FAILED_ATTEMPTS = 10
const LOCKOUT_DURATION_MS = 30 * 60 * 1000 // 30 minutes

// Phone validation: Thai mobile format (0X-XXXX-XXXX) or international
const PHONE_REGEX = /^(\+?66|0)[0-9]{8,9}$/

function validatePhone(phone: string): boolean {
    const cleaned = phone.replace(/[\s\-()]/g, '')
    return PHONE_REGEX.test(cleaned)
}

function cleanPhone(phone: string): string {
    return phone.replace(/[\s\-()]/g, '')
}

export async function loginWithPhoneAndSelfie(prevState: ActionState, formData: FormData) {
    const phone = formData.get('phone') as string
    const pin = formData.get('pin') as string

    if (!phone || !pin) {
        return { error: 'Phone number and PIN are required' }
    }

    // Server-side phone validation
    const cleanedPhone = cleanPhone(phone)
    if (!validatePhone(cleanedPhone)) {
        return { error: 'Invalid phone number format' }
    }

    // PIN format validation
    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
        return { error: 'PIN must be exactly 6 digits' }
    }

    // Rate limiting: 5 attempts per 15 minutes per IP+phone
    const headersList = await headers()
    const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rateLimitResult = checkRateLimit(`${ip}:${cleanedPhone}`)
    if (!rateLimitResult.allowed) {
        return { error: `พยายามเข้าสู่ระบบมากเกินไป กรุณารอ ${rateLimitResult.retryAfterMinutes} นาที` }
    }

    // Use service role client for secure server-side operations
    const supabase = createServiceClient()

    // IP Blocklist check
    const ipBlocked = await checkIpBlocked(ip, supabase)
    if (ipBlocked) {
        await logActivity('LOGIN_BLOCKED_IP', { ip, phone: cleanedPhone }, undefined)
        return { error: 'การเข้าถึงจาก IP นี้ถูกบล็อค กรุณาติดต่อผู้ดูแลระบบ' }
    }

    try {
        // 1. Verify Credentials
        const { data: user, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('phone', cleanedPhone)
            .single()

        if (error || !user) {
            return { error: 'Phone number not found' }
        }

        // 2. Account Lockout Check
        const lockedUntil = (user as any).locked_until ? new Date((user as any).locked_until) : null
        if (lockedUntil && lockedUntil > new Date()) {
            const minutesLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000)
            return { error: `บัญชีถูกล็อคชั่วคราว กรุณารอ ${minutesLeft} นาที หรือติดต่อผู้ดูแลระบบ` }
        }

        // 3. Verify PIN
        const pinValid = await bcrypt.compare(pin, user.pin || '')
        if (!pinValid) {
            // Increment failed attempts
            const currentAttempts = ((user as any).failed_login_attempts || 0) + 1
            const updateData: Record<string, any> = { failed_login_attempts: currentAttempts }

            if (currentAttempts >= MAX_FAILED_ATTEMPTS) {
                updateData.locked_until = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
                await logActivity('ACCOUNT_LOCKED', {
                    phone: cleanedPhone,
                    attempts: currentAttempts,
                    ip
                }, undefined, user.id)
            }

            await supabase.from('profiles').update(updateData).eq('id', user.id)

            const remaining = MAX_FAILED_ATTEMPTS - currentAttempts
            if (remaining > 0 && remaining <= 3) {
                return { error: `รหัส PIN ไม่ถูกต้อง (เหลืออีก ${remaining} ครั้งก่อนบัญชีถูกล็อค)` }
            }
            if (currentAttempts >= MAX_FAILED_ATTEMPTS) {
                return { error: 'บัญชีถูกล็อค 30 นาที เนื่องจากใส่รหัสผิดเกินจำนวนครั้งที่กำหนด' }
            }
            return { error: 'รหัส PIN ไม่ถูกต้อง' }
        }

        if (!user.is_approved) {
            return { error: 'Your account is pending approval by an admin.' }
        }

        // Reset failed attempts on successful login
        if ((user as any).failed_login_attempts > 0 || (user as any).locked_until) {
            await supabase.from('profiles')
                .update({ failed_login_attempts: 0, locked_until: null })
                .eq('id', user.id)
        }

        // Log Login
        const sessionId = crypto.randomUUID()

        await supabase.from('login_logs').insert({
            user_id: user.id,
        })

        // UPDATE Single Session ID
        await supabase.from('profiles')
            .update({ active_session_id: sessionId })
            .eq('id', user.id)

        // Activity Log
        await logActivity('LOGIN', {
            method: 'phone_pin'
        }, undefined, user.id)

        // Set Signed Session Cookies
        const cookieStore = await cookies()
        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            expires,
            path: '/'
        }

        // HMAC-signed session token instead of raw UUID
        const sessionToken = createSessionToken(user.id)
        await cookieStore.set('session_token', sessionToken, cookieOptions)

        // Keep legacy cookie for backward compatibility during migration
        await cookieStore.set('session_user_id', user.id, cookieOptions)
        await cookieStore.set('session_role', user.role, cookieOptions)
        await cookieStore.set('session_id', sessionId, cookieOptions)

    } catch (err: unknown) {
        console.error('Unexpected error:', err)
        return { error: 'System busy, please try again.' }
    }

    redirect('/dashboard')
}

export async function registerUser(prevState: ActionState, formData: FormData) {
    const name = formData.get('name') as string
    const phone = formData.get('phone') as string
    const pin = formData.get('pin') as string

    if (!name || !phone || !pin) {
        return { error: 'All fields are required' }
    }

    // Server-side phone validation
    const cleanedPhone = cleanPhone(phone)
    if (!validatePhone(cleanedPhone)) {
        return { error: 'Invalid phone number format (e.g. 0812345678)' }
    }

    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
        return { error: 'PIN must be exactly 6 digits' }
    }

    // Name validation
    if (name.trim().length < 2) {
        return { error: 'Name must be at least 2 characters' }
    }

    // Use service role client
    const supabase = createServiceClient()

    // Check if exists
    const { data: existing } = await supabase.from('profiles').select('id').eq('phone', cleanedPhone).single()
    if (existing) {
        return { error: 'Phone number already registered' }
    }

    const hashedPin = await bcrypt.hash(pin, 12)

    const { data: newUser, error } = await supabase.from('profiles').insert({
        full_name: name.trim(),
        phone: cleanedPhone,
        pin: hashedPin,
        role: 'staff',
        is_approved: false
    }).select().single()

    if (error) {
        console.error('Registration error', error)
        return { error: 'Failed to register. Phone might be duplicate.' }
    }

    if (newUser) {
        await logActivity('REGISTER', { name: name.trim(), phone: cleanedPhone }, undefined, newUser.id)
    }

    return { error: '', success: true, message: 'Registration successful! Please wait for admin approval before logging in.' }
}

export async function logout() {
    const cookieStore = await cookies()
    const userId = cookieStore.get('session_user_id')?.value

    if (userId) {
        await logActivity('LOGOUT', {}, undefined, userId)
        const supabase = createServiceClient()
        await supabase.from('profiles').update({ active_session_id: null }).eq('id', userId)
    }

    cookieStore.delete('session_token')
    cookieStore.delete('session_user_id')
    cookieStore.delete('session_role')
    cookieStore.delete('session_id')

    redirect('/login')
}
