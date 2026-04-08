'use client'

import { useRouter } from 'next/navigation'
import { ShieldCheck, User, Users } from 'lucide-react'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useLocale } from '@/lib/i18n/context'
import MyJobDashboard from '../my-job/my-job-dashboard'
import type { PersonalJob, PersonalSetting, PersonalTicket } from '../my-job/actions'

// ============================================================================
// Types
// ============================================================================

interface SystemUser {
    id: string
    full_name: string | null
    department: string | null
}

interface AdminJobDashboardProps {
    users: SystemUser[]
    selectedUserId?: string
    jobs: PersonalJob[]
    settings: PersonalSetting[]
    jobTypes: PersonalSetting[]
    tickets: PersonalTicket[]
    ticketCategories: PersonalSetting[]
}

// ============================================================================
// Admin Job Dashboard
// ============================================================================

export default function AdminJobDashboard({
    users,
    selectedUserId,
    jobs,
    settings,
    jobTypes,
    tickets,
    ticketCategories,
}: AdminJobDashboardProps) {
    const { locale } = useLocale()
    const router = useRouter()

    const handleUserChange = (uid: string) => {
        if (uid === '__none__') {
            router.push('/jobs/admin-job', { scroll: false })
        } else {
            router.push(`/jobs/admin-job?user=${uid}`, { scroll: false })
        }
    }

    const selectedUser = selectedUserId ? users.find(u => u.id === selectedUserId) : undefined

    return (
        <div className="space-y-6">

            {/* ================================================================ */}
            {/* Header */}
            {/* ================================================================ */}
            <div>
                <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-violet-500" />
                    {locale === 'th' ? 'Admin Job' : 'Admin Job'}
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {locale === 'th'
                        ? 'ดูงานและ Ticket ของผู้ใช้แต่ละคน'
                        : "View any user's jobs and tickets"
                    }
                </p>
            </div>

            {/* ================================================================ */}
            {/* User Picker */}
            {/* ================================================================ */}
            <div className="flex items-center gap-3 p-4 bg-violet-50/60 dark:bg-violet-950/20 border border-violet-200/60 dark:border-violet-800/40 rounded-xl">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 shrink-0">
                    <Users className="h-5 w-5" />
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wide mb-1.5">
                        {locale === 'th' ? 'เลือกผู้ใช้' : 'Select User'}
                    </p>
                    <Select value={selectedUserId || '__none__'} onValueChange={handleUserChange}>
                        <SelectTrigger className="h-10 w-full sm:w-[300px] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700">
                            <SelectValue>
                                {selectedUser ? (
                                    <span className="flex items-center gap-2">
                                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-violet-100 dark:bg-violet-900 text-[10px] font-bold text-violet-700 dark:text-violet-300 shrink-0">
                                            {(selectedUser.full_name || '?').charAt(0).toUpperCase()}
                                        </span>
                                        {selectedUser.full_name || selectedUser.id.slice(0, 8)}
                                        {selectedUser.department && (
                                            <span className="text-zinc-400 text-xs">· {selectedUser.department}</span>
                                        )}
                                    </span>
                                ) : (
                                    <span className="text-zinc-400">
                                        {locale === 'th' ? '— เลือกผู้ใช้ —' : '— Select a user —'}
                                    </span>
                                )}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__none__">
                                <span className="text-zinc-400 italic">
                                    {locale === 'th' ? 'ยังไม่ได้เลือก' : 'None selected'}
                                </span>
                            </SelectItem>
                            {users.map(u => (
                                <SelectItem key={u.id} value={u.id}>
                                    <span className="flex items-center gap-2">
                                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-600 dark:text-zinc-300 shrink-0">
                                            {(u.full_name || '?').charAt(0).toUpperCase()}
                                        </span>
                                        {u.full_name || u.id.slice(0, 8)}
                                        {u.department && (
                                            <span className="text-zinc-400 text-xs">· {u.department}</span>
                                        )}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {selectedUser && (
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                            {jobs.length}
                            <span className="text-xs font-normal text-zinc-400 ml-1">
                                {locale === 'th' ? 'งาน' : 'jobs'}
                            </span>
                        </span>
                        <span className="text-xs text-zinc-500">
                            {tickets.filter(t => t.status !== 'closed').length}{' '}
                            {locale === 'th' ? 'ticket ที่เปิด' : 'open ticket(s)'}
                        </span>
                    </div>
                )}
            </div>

            {/* ================================================================ */}
            {/* Content Area */}
            {/* ================================================================ */}
            {!selectedUserId ? (
                <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-center h-16 w-16 rounded-full bg-violet-50 dark:bg-violet-950/30 text-violet-300 dark:text-violet-700 mb-4">
                        <User className="h-8 w-8" />
                    </div>
                    <p className="text-base font-semibold text-zinc-500 dark:text-zinc-400">
                        {locale === 'th' ? 'เลือกผู้ใช้เพื่อดูงาน' : 'Select a user to view their work'}
                    </p>
                    <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
                        {locale === 'th'
                            ? 'บอร์ดงานและ Ticket จะแสดงที่นี่'
                            : 'Their Kanban board and tickets will appear here'
                        }
                    </p>
                </div>
            ) : (
                <MyJobDashboard
                    jobs={jobs}
                    settings={settings}
                    jobTypes={jobTypes}
                    tickets={tickets}
                    ticketCategories={ticketCategories}
                    basePath={`/jobs/admin-job?user=${selectedUserId}`}
                    pageTitle={selectedUser?.full_name || 'User'}
                    pageTitleTh={selectedUser?.full_name || 'ผู้ใช้'}
                    pageSubtitle="Personal jobs and tickets (view only)"
                    pageSubtitleTh="งานและ Ticket ส่วนตัว (อ่านอย่างเดียว)"
                    readonly
                />
            )}
        </div>
    )
}

