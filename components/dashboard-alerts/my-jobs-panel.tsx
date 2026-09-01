'use client'

// แผงที่ 1 ของ dashboard-alerts — "งานในมือคุณ"
// ใบงานพูลที่ user เป็นผู้รับ (claimed_by) หรือถูก assign (assigned_to) และยังไม่จบ
// ใช้ได้ทั้ง /dashboard และ /jobs/tracking — รับแต่ข้อมูลดิบที่ serialize ได้ ไม่คิวรีเอง

import Link from 'next/link'
import { Briefcase, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { POOL_DONE_STATUSES, parseDate, type PoolJob } from '@/app/(authenticated)/jobs/tracking/tracking-logic'

/** `${job_type}:${status}` → ป้าย + สี (รูปแบบเดียวกับ jobStatusLabels ใน snapshot) */
export type JobStatusLabelMap = Record<string, { label: string; color: string | null }>

export interface MyJobsPanelProps {
    /** ใบงานพูลทั้งหมดของงานที่ลูกค้าตอบรับแล้ว (snapshot.poolJobs) */
    jobs: PoolJob[]
    /** crm_lead_id → วันงาน (YYYY-MM-DD) — ใช้เรียงลำดับและแสดงวัน */
    leadDates: Record<string, string | null>
    /** ผู้ใช้ที่ล็อกอินอยู่ — null = ไม่ render อะไรเลย */
    currentUserId: string | null
    /** ป้ายสถานะใบงานจาก job_settings (snapshot.jobStatusLabels) */
    statusLabels: JobStatusLabelMap
    /** ไม่มีงานค้าง = โชว์การ์ดเปล่าแทนการหาย (ใช้บน dashboard 3 คอลัมน์ ให้ layout ไม่ยุบ) */
    showEmpty?: boolean
    className?: string
}

/** จำนวนแถวสูงสุดที่แสดง — เกินกว่านี้ตกไปที่ลิงก์ "ดูทั้งหมด" */
const MAX_ROWS = 5

const TYPE_LABELS: Record<string, string> = {
    graphic: 'กราฟิก',
    onsite: 'หน้างาน',
}

/** วันที่แบบไทยจาก YYYY-MM-DD — รูปแบบเดียวกับหน้าติดตามงาน */
const formatDate = (d: string | null) =>
    d ? parseDate(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : null

/** แท็บพูลของประเภทใบงาน — ประเภทอื่นไม่มีแท็บ ปล่อยให้ไปหน้าติดตามงานเฉยๆ */
const tabOf = (jobType: string) => (jobType === 'graphic' || jobType === 'onsite' ? jobType : null)

/** ลิงก์ไปแท็บพูลพร้อมไฮไลต์งาน — ใบที่ไม่ผูกงานได้แค่แท็บ */
function hrefOf(job: PoolJob): string {
    const tab = tabOf(job.job_type)
    const params = new URLSearchParams()
    if (tab) params.set('tab', tab)
    if (job.crm_lead_id) params.set('lead', job.crm_lead_id)
    const qs = params.toString()
    return qs ? `/jobs/tracking?${qs}` : '/jobs/tracking'
}

/**
 * ใบงานที่ค้างอยู่ในมือ user — เรียงวันงานใกล้สุดก่อน (ไม่มีวัน/ไม่มีงานผูก = ท้ายสุด)
 * เกณฑ์เดียวกับสเปค: เป็นผู้รับหรือถูก assign และสถานะยังไม่ done/skipped
 */
function pendingJobsOf(jobs: PoolJob[], leadDates: Record<string, string | null>, userId: string): PoolJob[] {
    const finished = new Set(POOL_DONE_STATUSES)
    const mine = jobs.filter(
        j => !finished.has(j.status) && (j.claimed_by === userId || j.assigned_to.includes(userId))
    )
    const dateOf = (j: PoolJob) => (j.crm_lead_id ? leadDates[j.crm_lead_id] ?? null : null)
    return mine.sort((a, b) => {
        const da = dateOf(a)
        const db = dateOf(b)
        if (da && db) return da.localeCompare(db)
        if (da) return -1
        if (db) return 1
        return 0
    })
}

export default function MyJobsPanel({ jobs, leadDates, currentUserId, statusLabels, showEmpty = false, className }: MyJobsPanelProps) {
    if (!currentUserId) return null

    const pending = pendingJobsOf(jobs, leadDates, currentUserId)
    // แผงว่าง: ค่าเริ่มต้นไม่ render อะไรเลย · showEmpty = การ์ดเปล่าบอกว่าเคลียร์หมดแล้ว
    if (pending.length === 0) {
        if (!showEmpty) return null
        return (
            <div className={cn('px-4 pt-4 md:pt-6', className)}>
                <section className="mx-auto w-full max-w-2xl rounded-2xl border shadow-sm border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-3">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        <Briefcase className="h-4 w-4" />
                        งานในมือคุณ (0)
                    </h2>
                    <p className="py-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
                        ไม่มีใบงานค้างในมือ 🎉
                    </p>
                </section>
            </div>
        )
    }

    const shown = pending.slice(0, MAX_ROWS)

    return (
        // div นอกคุมระยะขอบของหน้า (override ได้ด้วย className) — การ์ดข้างในคุมความกว้าง
        <div className={cn('px-4 pt-4 md:pt-6', className)}>
            <section className="mx-auto w-full max-w-2xl rounded-2xl border shadow-sm border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/5 p-3 space-y-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                    <Briefcase className="h-4 w-4" />
                    งานในมือคุณ ({pending.length})
                </h2>

                <ul className="space-y-1.5">
                    {shown.map(job => {
                        const date = formatDate(job.crm_lead_id ? leadDates[job.crm_lead_id] ?? null : null)
                        const status = statusLabels[`${job.job_type}:${job.status}`]
                        return (
                            <li key={job.id}>
                                <Link
                                    href={hrefOf(job)}
                                    className="group flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 hover:border-amber-400 dark:hover:border-amber-500/60 transition-colors"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                            {job.title || 'ไม่ระบุชื่อใบงาน'}
                                        </div>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                            <span>{TYPE_LABELS[job.job_type] || job.job_type || 'ไม่ระบุประเภท'}</span>
                                            <span className={cn(date ? 'text-sky-700 dark:text-sky-400' : 'italic text-zinc-400')}>
                                                {date || 'ยังไม่ระบุวันงาน'}
                                            </span>
                                            {status && (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color || '#a1a1aa' }} />
                                                    {status.label}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 group-hover:text-amber-500 dark:text-zinc-600 transition-colors" />
                                </Link>
                            </li>
                        )
                    })}
                </ul>

                {pending.length > MAX_ROWS && (
                    <Link
                        href="/jobs/tracking"
                        className="inline-block text-xs font-medium text-amber-800 dark:text-amber-300 hover:underline"
                    >
                        ดูทั้งหมด ({pending.length} ใบ)
                    </Link>
                )}
            </section>
        </div>
    )
}
