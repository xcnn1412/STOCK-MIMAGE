'use client'

import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { formatThaiDate } from '@/lib/thai-date'
import type { CrmDeletedLead } from '../types'

type Rec = Record<string, unknown>

const money = (v: unknown) => (v == null || v === '' ? '-' : `฿${Number(v).toLocaleString('th-TH')}`)
const show = (v: unknown) => (v == null || v === '' ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** ค่าในแถวเป็นรายการ คีย์ : ค่า */
function KeyValues({ row }: { row: Rec }) {
    return (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
            {Object.entries(row).map(([k, v]) => (
                <Fragment key={k}>
                    <dt className="font-mono text-muted-foreground">{k}</dt>
                    <dd className="break-all text-zinc-800 dark:text-zinc-200">{show(v)}</dd>
                </Fragment>
            ))}
        </dl>
    )
}

function Section({ title, rows, none }: { title: string; rows: Rec[]; none: string }) {
    return (
        <div className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title} ({rows.length})</div>
            {rows.length === 0
                ? <div className="text-xs text-muted-foreground">{none}</div>
                : rows.map((r, i) => (
                    <div key={i} className="rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
                        <KeyValues row={r} />
                    </div>
                ))}
        </div>
    )
}

// ดูข้อมูลอย่างเดียว — ยังไม่มีปุ่มกู้คืนในรอบนี้
export default function TrashView({ rows, names, error }: { rows: CrmDeletedLead[]; names: Record<string, string>; error: string | null }) {
    const { t } = useLocale()
    const tc = t.crm.trash
    const [open, setOpen] = useState<string | null>(null)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="flex items-center gap-2.5 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    <Trash2 className="h-6 w-6 text-zinc-400" />
                    {tc.title}
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{tc.subtitle.replace('{count}', String(rows.length))}</p>
            </div>

            {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            {rows.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">{tc.empty}</div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full text-sm">
                        <thead className="bg-zinc-50 text-xs text-muted-foreground dark:bg-zinc-800/50">
                            <tr>
                                <th className="w-8 px-2 py-2" />
                                <th className="px-3 py-2 text-left font-medium">{tc.deletedAt}</th>
                                <th className="px-3 py-2 text-left font-medium">{tc.deletedBy}</th>
                                <th className="px-3 py-2 text-left font-medium">{tc.customer}</th>
                                <th className="px-3 py-2 text-left font-medium">{tc.phone}</th>
                                <th className="px-3 py-2 text-left font-medium">{tc.eventDate}</th>
                                <th className="px-3 py-2 text-left font-medium">{tc.status}</th>
                                <th className="px-3 py-2 text-right font-medium">{tc.quoted}</th>
                                <th className="px-3 py-2 text-right font-medium">{tc.confirmed}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {rows.map(r => {
                                const lead = (r.snapshot?.lead ?? {}) as Rec
                                const isOpen = open === r.id
                                return (
                                    <Fragment key={r.id}>
                                        <tr className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50" onClick={() => setOpen(isOpen ? null : r.id)}>
                                            <td className="px-2 py-2.5 text-zinc-400" title={isOpen ? tc.hide : tc.show}>
                                                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2.5">{formatThaiDate(r.deleted_at)}</td>
                                            <td className="px-3 py-2.5">{(r.deleted_by && names[r.deleted_by]) || '-'}</td>
                                            <td className="px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{r.customer_name || '-'}</td>
                                            <td className="px-3 py-2.5">{show(lead.customer_phone)}</td>
                                            <td className="whitespace-nowrap px-3 py-2.5">{formatThaiDate(lead.event_date as string | null) || '-'}</td>
                                            <td className="px-3 py-2.5">{r.status ? (t.crm.statuses[r.status] || r.status) : '-'}</td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">{money(lead.quoted_price)}</td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">{money(lead.confirmed_price)}</td>
                                        </tr>
                                        {isOpen && (
                                            <tr className="bg-zinc-50/60 dark:bg-zinc-900/60">
                                                <td colSpan={9} className="space-y-4 px-4 py-4">
                                                    <Section title={tc.lead} rows={[lead]} none={tc.none} />
                                                    <Section title={tc.installments} rows={(r.snapshot?.installments ?? []) as Rec[]} none={tc.none} />
                                                    <Section title={tc.activities} rows={(r.snapshot?.activities ?? []) as Rec[]} none={tc.none} />
                                                    <Section title={tc.events} rows={(r.snapshot?.events ?? []) as Rec[]} none={tc.none} />
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
