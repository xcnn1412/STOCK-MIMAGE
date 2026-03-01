'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'

async function getSession() {
    const cookieStore = await cookies()
    const userId = cookieStore.get('session_user_id')?.value
    const role = cookieStore.get('session_role')?.value
    return { userId, role }
}

/** Unlock a locked user account (admin only) */
export async function unlockUser(targetUserId: string) {
    const { userId, role } = await getSession()
    if (!userId || role !== 'admin') return { error: 'Admin เท่านั้น' }

    const supabase = createServiceClient()

    const { data: target } = await supabase
        .from('profiles')
        .select('full_name, failed_login_attempts, locked_until')
        .eq('id', targetUserId)
        .single()

    if (!target) return { error: 'ไม่พบผู้ใช้' }

    const { error } = await supabase
        .from('profiles')
        .update({ failed_login_attempts: 0, locked_until: null })
        .eq('id', targetUserId)

    if (error) return { error: 'เกิดข้อผิดพลาด' }

    await logActivity('ACCOUNT_UNLOCKED', {
        targetUserId,
        targetName: (target as any).full_name,
        previousAttempts: (target as any).failed_login_attempts,
    }, targetUserId)

    revalidatePath('/users')
    revalidatePath('/security')
    return { success: true }
}

/** Force logout a user by clearing their active session (admin only) */
export async function forceLogout(targetUserId: string) {
    const { userId, role } = await getSession()
    if (!userId || role !== 'admin') return { error: 'Admin เท่านั้น' }

    const supabase = createServiceClient()

    const { error } = await supabase
        .from('profiles')
        .update({ active_session_id: null })
        .eq('id', targetUserId)

    if (error) return { error: 'เกิดข้อผิดพลาด' }

    await logActivity('LOGOUT', {
        forced: true,
        targetUserId,
        forcedBy: userId,
    }, targetUserId)

    revalidatePath('/users')
    revalidatePath('/security')
    return { success: true }
}
