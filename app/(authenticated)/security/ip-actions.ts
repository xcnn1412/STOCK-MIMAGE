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

export async function getIpRules() {
    const { userId, role } = await getSession()
    if (!userId || role !== 'admin') return { data: [], error: 'Admin เท่านั้น' }

    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('ip_rules')
        .select('*, creator:created_by(full_name)')
        .order('created_at', { ascending: false })

    return { data: data || [], error: error?.message }
}

export async function createIpRule(input: {
    ip_address: string
    rule_type: 'allow' | 'block'
    reason?: string
    expires_at?: string | null
}) {
    const { userId, role } = await getSession()
    if (!userId || role !== 'admin') return { error: 'Admin เท่านั้น' }

    // Validate IP format (basic)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F:]+)$/
    if (!input.ip_address || !ipRegex.test(input.ip_address.trim())) {
        return { error: 'รูปแบบ IP ไม่ถูกต้อง' }
    }

    const supabase = createServiceClient()
    const { error } = await supabase.from('ip_rules').insert({
        ip_address: input.ip_address.trim(),
        rule_type: input.rule_type,
        reason: input.reason || null,
        expires_at: input.expires_at || null,
        created_by: userId,
        is_active: true,
    })

    if (error) return { error: 'เกิดข้อผิดพลาด' }

    await logActivity('IP_RULE_CREATED', {
        ip_address: input.ip_address,
        rule_type: input.rule_type,
        reason: input.reason,
    })

    revalidatePath('/security')
    return { success: true }
}

export async function deleteIpRule(id: string) {
    const { userId, role } = await getSession()
    if (!userId || role !== 'admin') return { error: 'Admin เท่านั้น' }

    const supabase = createServiceClient()

    const { data: rule } = await supabase
        .from('ip_rules')
        .select('ip_address, rule_type')
        .eq('id', id)
        .single()

    const { error } = await supabase.from('ip_rules').delete().eq('id', id)
    if (error) return { error: 'เกิดข้อผิดพลาด' }

    await logActivity('IP_RULE_DELETED', {
        ip_address: rule?.ip_address,
        rule_type: rule?.rule_type,
    })

    revalidatePath('/security')
    return { success: true }
}

export async function toggleIpRule(id: string, is_active: boolean) {
    const { userId, role } = await getSession()
    if (!userId || role !== 'admin') return { error: 'Admin เท่านั้น' }

    const supabase = createServiceClient()
    const { error } = await supabase.from('ip_rules').update({ is_active }).eq('id', id)
    if (error) return { error: 'เกิดข้อผิดพลาด' }

    revalidatePath('/security')
    return { success: true }
}
