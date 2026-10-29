import { cache } from 'react'
import { cookies } from 'next/headers'
import { verifySessionToken } from './session'
import { getLicenseStatus } from './license'
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
 * 3. Validates against DB: is_approved, !is_blocked, and active_session_id must be non-null
 *    and equal to the session_id cookie (logged out / logged in elsewhere = null)
 * 4. ใบอนุญาตหมดอายุ = null — /api/* ไม่ผ่าน proxy.ts จึงต้องกันที่นี่ด้วย (รายงาน L6)
 *    (env ไม่ได้ตั้ง/ผิดรูปแบบ ไม่นับที่นี่ — proxy ปิดทุกหน้าอยู่แล้ว และชุดตรวจหลายตัวไม่ได้ตั้ง env)
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

    const license = getLicenseStatus()
    if (license.configured && license.expired) return null

    // Verify HMAC signature and expiry
    const verified = verifySessionToken(token)
    if (!verified) return null

    const { userId } = verified

    // Validate against DB
    try {
        const supabase = createServiceClient()
        const { data } = await supabase
            .from('profiles')
            .select('id, role, is_approved, is_blocked, active_session_id, department, full_name, nickname')
            .eq('id', userId)
            .single()

        // is_blocked: เผื่อระงับตรงใน SQL โดยไม่ล้าง active_session_id (รายงาน L10)
        if (!data || !data.is_approved || data.is_blocked) return null

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

/** โมดูลของผู้ใช้ — อ่าน profiles.allowed_modules ครั้งเดียวต่อ request (null = ['stock'] ค่าเริ่มต้นเดียวกับ proxy.ts) */
const loadModules = cache(async (userId: string): Promise<string[]> => {
    const { data } = await createServiceClient()
        .from('profiles')
        .select('allowed_modules')
        .eq('id', userId)
        .maybeSingle()
    return Array.isArray(data?.allowed_modules) ? (data.allowed_modules as string[]) : ['stock']
})

/**
 * ตัวตน + สิทธิ์โมดูล: admin ผ่านทุกโมดูล · คนอื่นต้องมีคีย์ใดคีย์หนึ่งใน profiles.allowed_modules
 * ไม่ล็อกอินหรือไม่มีสิทธิ์ = null
 *
 * server action ที่อ่าน/เขียนข้อมูลของโมดูลต้องเรียกตัวนี้ ไม่ใช่แค่ requireAuth() — proxy.ts คุมแค่ URL
 * ของหน้า แต่ action ถูกเรียกจากหน้าไหนก็ได้ (รายงานความปลอดภัย 2026-10-29 ข้อ H5/H6)
 */
export async function requireModule(keys: string | string[]): Promise<AuthSession | null> {
    const session = await requireAuth()
    if (!session) return null
    if (session.role === 'admin') return session
    const wanted = Array.isArray(keys) ? keys : [keys]
    const modules = await loadModules(session.userId)
    return wanted.some(k => modules.includes(k)) ? session : null
}

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
