import { supabase } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LogsTable from './logs-table'

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
        <div className="space-y-4 md:space-y-6">
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">System Logs</h2>
                <p className="text-sm md:text-base text-zinc-500">View user activities and system events.</p>
                {error && (
                    <div className="p-3 bg-red-50 text-red-600 rounded text-sm mt-2">
                        Error loading logs: {error.message}. Please checking RLS policies.
                    </div>
                )}
            </div>

            <LogsTable initialLogs={logs || []} />
        </div>
    )
}
