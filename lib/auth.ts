import { cookies } from 'next/headers'
import { verifySessionToken } from './session'
import { createServiceClient } from './supabase-server'

export interface AuthSession {
    userId: string
    role: string
    sessionId: string
}

/**
 * Centralized authentication check for Server Actions & Server Components.
 * 
 * 1. Reads session_token cookie
 * 2. Verifies HMAC signature & expiry
 * 3. Validates against DB (is_approved + active_session_id match)
 * 
 * Returns AuthSession or null. Use this instead of raw cookie reads.
 */
export async function requireAuth(): Promise<AuthSession | null> {
    const cookieStore = await cookies()
    const token = cookieStore.get('session_token')?.value
    const sessionId = cookieStore.get('session_id')?.value

    if (!token) return null

    // Verify HMAC signature and expiry
    const verified = verifySessionToken(token)
    if (!verified) return null

    const { userId } = verified

    // Validate against DB
    try {
        const supabase = createServiceClient()
        const { data } = await supabase
            .from('profiles')
            .select('id, role, is_approved, active_session_id')
            .eq('id', userId)
            .single()

        if (!data || !data.is_approved) return null

        // Single-session enforcement
        if (data.active_session_id && sessionId && data.active_session_id !== sessionId) {
            return null // Logged in elsewhere
        }

        return {
            userId: data.id,
            role: data.role || 'staff',
            sessionId: sessionId || ''
        }
    } catch {
        return null
    }
}

/**
 * Lightweight session check (no DB call).
 * Only verifies cookie signature and expiry.
 * Use for non-critical reads where DB round-trip is expensive.
 */
export async function getSessionLight() {
    const cookieStore = await cookies()
    const token = cookieStore.get('session_token')?.value
    const role = cookieStore.get('session_role')?.value
    const sessionId = cookieStore.get('session_id')?.value

    if (!token) return { userId: undefined, role: undefined }

    const verified = verifySessionToken(token)
    if (!verified) return { userId: undefined, role: undefined }

    return { userId: verified.userId, role, sessionId }
}
