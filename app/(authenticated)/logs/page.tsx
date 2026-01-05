import { supabase } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LogsView from './logs-view'

export const revalidate = 60

export default async function ActivityLogsPage() {
    const cookieStore = await cookies()
    const role = cookieStore.get('session_role')?.value

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
        <LogsView logs={logs || []} error={error} />
    )
}
