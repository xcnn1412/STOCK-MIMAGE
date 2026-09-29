import { cache } from 'react'
import { cookies } from 'next/headers'
import { verifySessionToken } from './session'
import { createServiceClient } from './supabase-server'

export interface AuthSession {
    userId: string
    role: string
    sessionId: string
    /** แผนกของผู้ใช้ — อ่านมาพร้อมกันตอนตรวจ session (ผู้เรียกเดิมไม่ต้องคิวรี profiles ซ้ำ) */
    department?: string | null
    fullName?: string | null
    nickname?: string | null
}

/**
 * Centralized authentication check for Server Actions & Server Components —
 * the ONLY way to learn who the caller is.
 *
 * 1. Reads session_token + session_id cookies (both required)
 * 2. Verifies HMAC signature & expiry
 * 3. Validates against DB: is_approved, and active_session_id must be non-null
 *    and equal to the session_id cookie (logged out / logged in elsewhere = null)
 *
 * Role comes from the DB row, never from a cookie. Legacy session_user_id /
 * session_role cookies are ignored. cache(): one DB round per request.
 *
 * Returns AuthSession or null. Use this instead of raw cookie reads.
 */
export const requireAuth = cache(async (): Promise<AuthSession | null> => {
    const cookieStore = await cookies()
    const token = cookieStore.get('session_token')?.value
    const sessionId = cookieStore.get('session_id')?.value

    if (!token || !sessionId) return null

    // Verify HMAC signature and expiry
    const verified = verifySessionToken(token)
    if (!verified) return null

    const { userId } = verified

    // Validate against DB
    try {
        const supabase = createServiceClient()
        const { data } = await supabase
            .from('profiles')
            .select('id, role, is_approved, active_session_id, department, full_name, nickname')
            .eq('id', userId)
            .single()

        if (!data || !data.is_approved) return null

        // Single-session enforcement — null = logged out / force-logged-out / blocked
        if (!data.active_session_id || data.active_session_id !== sessionId) {
            return null
        }

        return {
            userId: data.id,
            role: data.role || 'staff',
            sessionId,
            department: (data.department as string) ?? null,
            fullName: (data.full_name as string) ?? null,
            nickname: (data.nickname as string) ?? null
        }
    } catch {
        return null
    }
})

/**
 * Same verified session as requireAuth() in the older { userId, role, sessionId } shape.
 * DB-backed (role comes from the DB row) but cached per request, so calling it next to
 * requireAuth() costs no extra round-trip.
 */
export async function getSessionLight() {
    const session = await requireAuth()
    return session
        ? { userId: session.userId, role: session.role, sessionId: session.sessionId }
        : { userId: undefined, role: undefined }
}
