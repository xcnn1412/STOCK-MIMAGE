import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Check if an IP address is blocked by the ip_rules table.
 * 
 * Logic:
 * 1. If there are active "block" rules matching the IP → blocked
 * 2. Expired rules are ignored
 */
export async function checkIpBlocked(ip: string, supabase: SupabaseClient): Promise<boolean> {
    if (!ip || ip === 'unknown') return false

    try {
        const { data } = await supabase
            .from('ip_rules')
            .select('id, rule_type, expires_at')
            .eq('ip_address', ip)
            .eq('is_active', true)
            .eq('rule_type', 'block')

        if (!data || data.length === 0) return false

        // Check if any non-expired block rule exists
        const now = new Date()
        return data.some(rule => {
            if (!rule.expires_at) return true // No expiry = permanent block
            return new Date(rule.expires_at) > now
        })
    } catch {
        // If IP check fails, don't block the user
        console.error('IP check failed — allowing access')
        return false
    }
}
