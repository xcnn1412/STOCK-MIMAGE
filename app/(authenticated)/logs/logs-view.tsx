'use client'

import LogsTable from './logs-table'
import { useLanguage } from '@/contexts/language-context'
import type { ActivityLog } from '@/types'

export default function LogsView({ logs, error }: { logs: ActivityLog[], error: string | null }) {
    const { t } = useLanguage()

    return (
        <div className="space-y-4 md:space-y-6">
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{t.logs.title}</h2>
                <p className="text-sm md:text-base text-zinc-500">View user activities and system events.</p>
                {error && (
                    <div className="p-3 bg-red-50 text-red-600 rounded text-sm mt-2">
                        Error loading logs: {error}. Please checking RLS policies.
                    </div>
                )}
            </div>

            <LogsTable initialLogs={logs || []} />
        </div>
    )
}
