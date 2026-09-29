'use client'

// หน้าต่างสร้างเช็กลิสต์ — 2 แบบ: ผูกงานจาก CRM (งานละหนึ่งใบ) / ทั่วไป (ไม่ผูกงาน ตั้งชื่อเอง)
// ค้นงาน: เรียก searchPurchaseLeads หลังหยุดพิมพ์ 300ms · เปิดหน้าต่าง = เรียกทันทีด้วยคำค้นว่าง (เสนองานที่ตอบรับแล้ว)
// คำตอบที่มาถึงหลังคำค้นใหม่กว่าถูกทิ้ง (เลขลำดับคำขอ) · งานที่มีเช็กลิสต์แล้ว = กดแล้วเปิดใบเดิม ไม่สร้างซ้ำ
// ไม่ทำแบบชั่วคราว: ต้องรอ id ของใบใหม่จาก server ก่อนเปิด (?list=)

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Calendar, Loader2, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatThaiDate } from '@/lib/thai-date'
import { createPurchaseList, searchPurchaseLeads } from '../actions'
import {
    validateListInput,
    type CreatePurchaseListInput,
    type PurchaseLeadOption,
    type PurchaseTemplate,
} from '../purchasing-logic'
import { DATE_INPUT_CLASS } from './list-dialogs'
import { FieldError, SAVE_FAILED } from './shared'

/** หน่วงค้นหลังหยุดพิมพ์ (ms) */
const SEARCH_DELAY = 300
/** ค่าของตัวเลือก "ไม่ใช้ชุดสำเร็จรูป" — Radix Select ห้ามใช้สตริงว่างเป็นค่า */
const NO_TEMPLATE = '__none__'

type Mode = 'crm' | 'general'
const MODES: { key: Mode; label: string }[] = [
    { key: 'crm', label: 'ผูกงานจาก CRM' },
    { key: 'general', label: 'ทั่วไป (ไม่ผูกงาน)' },
]

export interface CreateListDialogProps {
    templates: PurchaseTemplate[]
    onOpenChange: (open: boolean) => void
    onCloseAutoFocus: (event: Event) => void
    /** ได้เช็กลิสต์แล้ว (สร้างใหม่ หรือ existed = งานนี้มีใบอยู่แล้ว) — หน้าปิดหน้าต่างแล้วเปิดใบนั้น */
    onDone: (listId: string, existed: boolean) => void
}

export function CreateListDialog({ templates, onOpenChange, onCloseAutoFocus, onDone }: CreateListDialogProps) {
    const uid = useId()
    const [mode, setMode] = useState<Mode>('crm')

    // --- ผูกงานจาก CRM ---
    const [query, setQuery] = useState('')
    /** null = ยังไม่ได้คำตอบแรก */
    const [leads, setLeads] = useState<PurchaseLeadOption[] | null>(null)
    const [searching, setSearching] = useState(true)
    const [searchError, setSearchError] = useState<string | null>(null)
    const [lead, setLead] = useState<PurchaseLeadOption | null>(null)
    /** เลขลำดับคำขอค้นล่าสุด — คำตอบของคำขอที่เก่ากว่าถูกทิ้ง */
    const latestRequest = useRef(0)

    // --- ทั่วไป ---
    const [title, setTitle] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [fieldErrors, setFieldErrors] = useState<{ title?: string; due_date?: string }>({})

    // --- ใช้ร่วม ---
    const [templateId, setTemplateId] = useState(NO_TEMPLATE)
    const [error, setError] = useState<string | null>(null)
    const [creating, startCreating] = useTransition()

    // ค้นงาน: ครั้งแรกตอนเปิดหน้าต่าง (คำค้นว่าง → งานที่ตอบรับแล้ว) เรียกทันที · หลังจากนั้นรอหยุดพิมพ์ 300ms ทุกครั้ง
    useEffect(() => {
        const delay = latestRequest.current === 0 ? 0 : SEARCH_DELAY
        const request = ++latestRequest.current
        const timer = setTimeout(
            async () => {
                setSearching(true)
                try {
                    const res = await searchPurchaseLeads(query)
                    if (request !== latestRequest.current) return // มีคำค้นใหม่กว่าแล้ว
                    if ('error' in res) {
                        setSearchError(res.error)
                        setLeads([])
                    } else {
                        setSearchError(null)
                        setLeads(res.leads)
                    }
                } catch (err) {
                    if (request !== latestRequest.current) return
                    console.error('[purchasing] search leads:', err)
                    setSearchError('ค้นหางานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
                    setLeads([])
                } finally {
                    if (request === latestRequest.current) setSearching(false)
                }
            },
            delay
        )
        return () => clearTimeout(timer)
    }, [query])

    const choose = (option: PurchaseLeadOption) => {
        setError(null)
        // งานนี้มีเช็กลิสต์แล้ว = เปิดใบเดิม (งานละหนึ่งใบ)
        if (option.list_id) {
            onDone(option.list_id, true)
            return
        }
        setLead(option)
    }

    const submit = () => {
        setError(null)
        const template = templateId === NO_TEMPLATE ? null : templateId
        let input: CreatePurchaseListInput
        if (mode === 'crm') {
            if (!lead) {
                setError('กรุณาเลือกงานจาก CRM ก่อน')
                return
            }
            input = { leadId: lead.id, templateId: template }
        } else {
            const titleCheck = validateListInput({ title }, 'patch')
            const dueCheck = validateListInput({ due_date: dueDate }, 'patch')
            const nextErrors = {
                title: titleCheck.ok ? undefined : titleCheck.error,
                due_date: dueCheck.ok ? undefined : dueCheck.error,
            }
            if (nextErrors.title || nextErrors.due_date) {
                setFieldErrors(nextErrors)
                document.getElementById(nextErrors.title ? `${uid}-title` : `${uid}-due`)?.focus()
                return
            }
            input = { title: title.trim(), dueDate: dueDate || null, templateId: template }
        }
        startCreating(async () => {
            try {
                const res = await createPurchaseList(input)
                if ('error' in res) {
                    setError(res.error)
                    return
                }
                if (!res.existed) toast.success('สร้างเช็กลิสต์แล้ว')
                onDone(res.listId, res.existed)
            } catch (err) {
                console.error('[purchasing] create list:', err)
                setError(SAVE_FAILED)
            }
        })
    }

    const leadMeta = (option: PurchaseLeadOption) => (
        <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {option.event_date && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                    <Calendar className="h-3 w-3 shrink-0" aria-hidden />
                    {formatThaiDate(option.event_date)}
                </span>
            )}
            {option.event_location && (
                <span className="inline-flex min-w-0 items-start gap-1">
                    <MapPin className="mt-px h-3 w-3 shrink-0" aria-hidden />
                    <span className="wrap-anywhere">{option.event_location}</span>
                </span>
            )}
        </span>
    )

    const canSubmit = !creating && (mode === 'general' || !!lead)

    return (
        <Dialog open onOpenChange={next => !creating && onOpenChange(next)}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={onCloseAutoFocus}>
                <DialogHeader>
                    <DialogTitle>เพิ่มเช็กลิสต์</DialogTitle>
                    <DialogDescription>
                        เลือกงานจาก CRM (งานละหนึ่งเช็กลิสต์) หรือสร้างเช็กลิสต์ทั่วไปสำหรับของใช้ส่วนกลาง
                    </DialogDescription>
                </DialogHeader>

                <form
                    noValidate
                    className="space-y-4"
                    onSubmit={e => {
                        e.preventDefault()
                        submit()
                    }}
                >
                    {/* แบบของเช็กลิสต์ — ปุ่มสลับสองทาง */}
                    <div role="group" aria-label="แบบของเช็กลิสต์" className="grid grid-cols-2 gap-0.5 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
                        {MODES.map(m => (
                            <button
                                key={m.key}
                                type="button"
                                aria-pressed={mode === m.key}
                                onClick={() => {
                                    setMode(m.key)
                                    setError(null)
                                }}
                                className={cn(
                                    'min-h-9 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                                    mode === m.key
                                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                                )}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>

                    {mode === 'crm' ? (
                        lead ? (
                            <div className="flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30">
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">งานที่เลือก</p>
                                    <p className="text-sm font-medium text-zinc-900 wrap-anywhere dark:text-zinc-100">
                                        {lead.customer_name || 'ไม่ระบุชื่อลูกค้า'}
                                    </p>
                                    {leadMeta(lead)}
                                </div>
                                <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setLead(null)}>
                                    เปลี่ยนงาน
                                </Button>
                            </div>
                        ) : (
                            <Command
                                shouldFilter={false}
                                label="ค้นหางานจาก CRM"
                                className="rounded-lg border border-zinc-200 dark:border-zinc-800"
                            >
                                <CommandInput
                                    value={query}
                                    onValueChange={setQuery}
                                    placeholder="พิมพ์ชื่อลูกค้า หรือสถานที่…"
                                    aria-label="ค้นหางานจาก CRM ด้วยชื่อลูกค้าหรือสถานที่"
                                    autoFocus
                                />
                                <CommandList className="max-h-[min(18rem,40dvh)]">
                                    {searchError && (
                                        <p role="alert" className="px-3 py-4 text-sm text-red-600 dark:text-red-400">
                                            {searchError}
                                        </p>
                                    )}
                                    {!searchError && leads !== null && leads.length === 0 && !searching && (
                                        <p className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                                            {query.trim()
                                                ? 'ไม่พบงานที่ตรงกับคำค้น — ลองพิมพ์ชื่อลูกค้าหรือสถานที่อื่น'
                                                : 'ยังไม่มีงานที่ตอบรับแล้วในช่วงนี้ — พิมพ์ชื่อลูกค้าเพื่อค้นหา'}
                                        </p>
                                    )}
                                    {leads !== null && leads.length > 0 && (
                                        <CommandGroup heading={query.trim() ? 'ผลการค้นหา' : 'งานที่ตอบรับแล้ว เรียงตามวันงาน'}>
                                            {leads.map(option => (
                                                <CommandItem
                                                    key={option.id}
                                                    value={option.id}
                                                    onSelect={() => choose(option)}
                                                    className="flex min-h-11 items-start gap-2 py-2"
                                                >
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block text-sm font-medium wrap-anywhere">
                                                            {option.customer_name || 'ไม่ระบุชื่อลูกค้า'}
                                                        </span>
                                                        {leadMeta(option)}
                                                    </span>
                                                    {option.list_id && (
                                                        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                                                            มีเช็กลิสต์แล้ว
                                                        </span>
                                                    )}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    )}
                                    {searching && (
                                        <p className="flex items-center gap-2 px-3 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                            กำลังค้นหา…
                                        </p>
                                    )}
                                </CommandList>
                            </Command>
                        )
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
                            <div className="space-y-1.5">
                                <Label htmlFor={`${uid}-title`}>ชื่อเช็กลิสต์</Label>
                                <Input
                                    id={`${uid}-title`}
                                    value={title}
                                    onChange={e => {
                                        setTitle(e.target.value)
                                        if (fieldErrors.title) setFieldErrors(f => ({ ...f, title: undefined }))
                                    }}
                                    placeholder="เช่น ของใช้ส่วนกลางเดือนตุลาคม"
                                    aria-invalid={!!fieldErrors.title || undefined}
                                    aria-describedby={fieldErrors.title ? `${uid}-title-error` : undefined}
                                    autoFocus
                                />
                                <FieldError id={`${uid}-title-error`} message={fieldErrors.title} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor={`${uid}-due`}>ต้องได้ของภายใน (ไม่บังคับ)</Label>
                                <Input
                                    id={`${uid}-due`}
                                    type="date"
                                    value={dueDate}
                                    onChange={e => {
                                        setDueDate(e.target.value)
                                        if (fieldErrors.due_date) setFieldErrors(f => ({ ...f, due_date: undefined }))
                                    }}
                                    className={DATE_INPUT_CLASS}
                                    aria-invalid={!!fieldErrors.due_date || undefined}
                                    aria-describedby={fieldErrors.due_date ? `${uid}-due-error` : undefined}
                                />
                                <FieldError id={`${uid}-due-error`} message={fieldErrors.due_date} />
                                {dueDate && !fieldErrors.due_date && (
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatThaiDate(dueDate)}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {templates.length > 0 && (
                        <div className="space-y-1.5">
                            <Label htmlFor={`${uid}-template`}>ชุดรายการสำเร็จรูป (ไม่บังคับ)</Label>
                            <Select value={templateId} onValueChange={setTemplateId}>
                                <SelectTrigger id={`${uid}-template`} className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_TEMPLATE}>ไม่ใช้ — เริ่มจากเช็กลิสต์ว่าง</SelectItem>
                                    {templates.map(t => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name} ({t.items.length} รายการ)
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {error && (
                        <p role="alert" className="text-sm text-red-600 wrap-anywhere dark:text-red-400">
                            {error}
                        </p>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={creating} onClick={() => onOpenChange(false)}>
                            ยกเลิก
                        </Button>
                        <Button type="submit" disabled={!canSubmit}>
                            {creating && <Loader2 className="animate-spin" aria-hidden />}
                            {creating ? 'กำลังสร้าง…' : 'สร้างเช็กลิสต์'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
