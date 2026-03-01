import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import SecurityDashboard from './security-dashboard'

export const revalidate = 30

export default async function SecurityPage() {
    const cookieStore = await cookies()
    const role = cookieStore.get('session_role')?.value

    if (role !== 'admin') {
        redirect('/dashboard')
    }

    const supabase = createServiceClient()

    // Parallel data fetching
    const [
        { data: recentLogins },
        { data: failedAttempts },
        { data: activeSessions },
        { data: lockedAccounts },
        { data: ipRules },
        { data: securityEvents },
        { count: todayLoginCount },
        { count: weekLoginCount },
    ] = await Promise.all([
        // Recent login logs
        supabase
            .from('login_logs')
            .select('*, user:user_id(full_name, phone)')
            .order('login_at', { ascending: false })
            .limit(20),

        // Recent failed login attempts (activity_logs with LOGIN action that indicate failures)
        supabase
            .from('activity_logs')
            .select('*, user:user_id(full_name)')
            .in('action_type', ['ACCOUNT_LOCKED', 'LOGIN_BLOCKED_IP'])
            .order('created_at', { ascending: false })
            .limit(20),

        // Active sessions
        supabase
            .from('profiles')
            .select('id, full_name, phone, role, active_session_id')
            .not('active_session_id', 'is', null),

        // Locked accounts
        supabase
            .from('profiles')
            .select('id, full_name, phone, failed_login_attempts, locked_until')
            .gt('locked_until', new Date().toISOString()),

        // IP rules
        supabase
            .from('ip_rules')
            .select('*, creator:created_by(full_name)')
            .order('created_at', { ascending: false }),

        // Recent security events
        supabase
            .from('activity_logs')
            .select('*, user:user_id(full_name)')
            .in('action_type', ['LOGIN', 'LOGOUT', 'REGISTER', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED', 'LOGIN_BLOCKED_IP', 'IP_RULE_CREATED', 'IP_RULE_DELETED', 'SESSION_TIMEOUT'])
            .order('created_at', { ascending: false })
            .limit(50),

        // Today's login count
        supabase
            .from('login_logs')
            .select('id', { count: 'exact', head: true })
            .gte('login_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),

        // This week's login count
        supabase
            .from('login_logs')
            .select('id', { count: 'exact', head: true })
            .gte('login_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ])

    return (
        <SecurityDashboard
            recentLogins={(recentLogins || []) as any[]}
            failedAttempts={(failedAttempts || []) as any[]}
            activeSessions={(activeSessions || []) as any[]}
            lockedAccounts={(lockedAccounts || []) as any[]}
            ipRules={(ipRules || []) as any[]}
            securityEvents={(securityEvents || []) as any[]}
            todayLoginCount={todayLoginCount || 0}
            weekLoginCount={weekLoginCount || 0}
        />
    )
}
