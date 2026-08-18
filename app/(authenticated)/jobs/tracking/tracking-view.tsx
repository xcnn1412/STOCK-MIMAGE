'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateLeadTracking } from '../actions'

export interface TrackingLead {
    id: string
    customer_name: string | null
    event_name: string | null
    event_date: string | null
    design_status: string
    supplier_note: string | null
    tracking_checklist: string[]
    staff: { name: string; role: string }[]
}

const DESIGN_OPTIONS = [
    { value: 'not_started', label: 'ยังไม่ออกแบบ' },
    { value: 'in_progress', label: 'กำลังออกแบบ' },
    { value: 'sent', label: 'ส่งลูกค้า' },
    { value: 'sent_email_cf', label: 'ส่งEmail+CFลูกค้า' },
]

function daysUntil(d: string | null) {
    if (!d) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const target = new Date(d); target.setHours(0, 0, 0, 0)
    return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function Countdown({ date }: { date: string | null }) {
    const d = daysUntil(date)
    if (d === null) return <span className="text-zinc-300 dark:text-zinc-600">—</span>
    const base = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap'
    if (d > 0) return <span className={`${base} bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900`}>อีก {d} วัน</span>
    if (d === 0) return <span className={`${base} bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900`}>วันนี้</span>
    return <span className={`${base} bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900`}>ผ่านมา {-d} วัน</span>
}

const CHECKLIST = [
    { key: 'lock_queue', label: 'ล็อคคิวรถ' },
    { key: 'on_site', label: 'ออกหน้างาน' },
]

export default function TrackingView({
    leads,
    roleLabels,
}: {
    leads: TrackingLead[]
    roleLabels: Record<string, string>
}) {
    const [rows, setRows] = useState(leads)
    const [, startTransition] = useTransition()

    const save = (
        id: string,
        patch: { design_status?: string; supplier_note?: string | null; tracking_checklist?: string[] }
    ) => {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
        startTransition(async () => {
            const res = await updateLeadTracking(id, patch)
            if (res?.error) toast.error(res.error)
        })
    }

    const formatDate = (d: string | null) =>
        d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">ติดตามงาน</h1>
                <p className="text-sm text-zinc-500">
                    ดีลที่ลูกค้าตอบรับแล้ว {rows.length} รายการ — ติดตามออกแบบ ซัพพลายเออร์ จัดคน และงานหน้างาน
                </p>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12">ลำดับ</TableHead>
                            <TableHead className="w-56">วันจัดงาน</TableHead>
                            <TableHead className="w-28">Countdown</TableHead>
                            <TableHead className="w-48">ออกแบบ</TableHead>
                            <TableHead className="w-56">ซัพพลายเออร์</TableHead>
                            <TableHead>จัดคน</TableHead>
                            <TableHead className="w-44">checklist</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-sm text-zinc-500 py-10">
                                    ยังไม่มีดีลที่ตอบรับ
                                </TableCell>
                            </TableRow>
                        )}
                        {rows.map((lead, i) => (
                            <TableRow key={lead.id}>
                                <TableCell className="text-zinc-500">{i + 1}</TableCell>

                                <TableCell>
                                    <div className="font-medium text-zinc-900 dark:text-zinc-100">{formatDate(lead.event_date)}</div>
                                    <Link
                                        href={`/crm/${lead.id}`}
                                        className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                                    >
                                        {lead.customer_name || 'ไม่ระบุลูกค้า'}
                                        {lead.event_name ? ` / ${lead.event_name}` : ''}
                                    </Link>
                                </TableCell>

                                <TableCell><Countdown date={lead.event_date} /></TableCell>

                                <TableCell>
                                    <Select
                                        value={lead.design_status}
                                        onValueChange={v => save(lead.id, { design_status: v })}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DESIGN_OPTIONS.map(o => (
                                                <SelectItem key={o.value} value={o.value}>
                                                    {o.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </TableCell>

                                <TableCell>
                                    <Input
                                        defaultValue={lead.supplier_note || ''}
                                        placeholder="ระบุซัพพลายเออร์"
                                        onBlur={e => {
                                            const v = e.target.value.trim()
                                            if (v !== (lead.supplier_note || '')) save(lead.id, { supplier_note: v || null })
                                        }}
                                    />
                                </TableCell>

                                <TableCell>
                                    {lead.staff.length === 0 ? (
                                        <span className="text-xs text-zinc-400">ยังไม่จัดคน</span>
                                    ) : (
                                        <div className="flex flex-wrap gap-1">
                                            {lead.staff.map((s, si) => (
                                                <span
                                                    key={si}
                                                    className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300"
                                                >
                                                    {s.name} · {roleLabels[s.role] || s.role}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </TableCell>

                                <TableCell>
                                    <div className="space-y-1.5">
                                        {CHECKLIST.map(c => {
                                            const checked = lead.tracking_checklist.includes(c.key)
                                            return (
                                                <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                                                    <Checkbox
                                                        checked={checked}
                                                        onCheckedChange={() =>
                                                            save(lead.id, {
                                                                tracking_checklist: checked
                                                                    ? lead.tracking_checklist.filter(k => k !== c.key)
                                                                    : [...lead.tracking_checklist, c.key],
                                                            })
                                                        }
                                                    />
                                                    {c.label}
                                                </label>
                                            )
                                        })}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
