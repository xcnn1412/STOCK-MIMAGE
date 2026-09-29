import { supabaseServer as supabase } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import LogsView from './logs-view'

export const revalidate = 60

export default async function ActivityLogsPage() {
    const session = await requireAuth()
    const role = session?.role

    if (role !== 'admin') {
        redirect('/dashboard')
    }

    const { data: logs, error } = await supabase
        .from('activity_logs')
        .select(`
            *,
            user:user_id (full_name, role),
            target:target_user_id (full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100)
    
    return (
        <LogsView logs={(logs || []) as any} error={error ? error.message : null} />
    )
}
